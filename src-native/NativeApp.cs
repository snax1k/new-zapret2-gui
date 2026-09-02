using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Zapret2App
{
    public class MainForm : Form
    {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr LoadLibrary(string lpFileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

        public const int WM_NCLBUTTONDOWN = 0xA1;
        public const int HTCAPTION = 0x2;

        /// <summary>Версия сборки. Показывается в логе и в заголовке окна.</summary>
        public const string AppVersion = "0.0.9";

        private WebView2 webView;
        private NotifyIcon trayIcon;
        private ContextMenu trayMenu;
        private string distPath;
        private string binPath;
        /// <summary>Каталог со списками доменов и подсетей (host-list).</summary>
        private string listsPath;
        private bool isExiting = false;

        /// <summary>Текущий процесс ядра winws.exe. null, если обход выключен.</summary>
        private Process winws;
        /// <summary>Последние строки stderr winws — нужны для внятного сообщения об ошибке.</summary>
        private readonly System.Collections.Generic.List<string> lastErrors = new System.Collections.Generic.List<string>();
        private readonly object procLock = new object();
        /// <summary>Останов инициирован пользователем — не считать выход процесса аварией.</summary>
        private bool stopRequested = false;

        // ---- Файловый лог с ротацией -------------------------------------
        /// <summary>Порог ротации: при превышении лог упаковывается в zip.</summary>
        private const long LOG_MAX_BYTES = 10L * 1024 * 1024;
        /// <summary>Сколько zip-архивов держать в папке логов.</summary>
        private const int LOG_KEEP_ARCHIVES = 5;

        private string logDir;
        private string logFilePath;
        private StreamWriter logWriter;
        private long logBytes;
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> logQueue =
            new System.Collections.Concurrent.ConcurrentQueue<string>();
        private readonly ManualResetEvent logSignal = new ManualResetEvent(false);
        private Thread logThread;
        private volatile bool logStop = false;

        // Поток вывода winws с --debug — это тысячи строк в секунду. В файл
        // пишется всё, в интерфейс — не более UI_LOG_PER_SEC обычных строк в
        // секунду (ошибки проходят всегда), иначе WebView захлёбывается.
        private const int UI_LOG_PER_SEC = 12;
        /// <summary>Лимит для важных строк — иначе поток ошибок так же вешает UI.</summary>
        private const int UI_LOG_IMPORTANT_PER_SEC = 30;
        /// <summary>Предохранитель от роста очереди, если диск не успевает.</summary>
        private const int LOG_QUEUE_MAX = 200000;
        private int uiLogSecond = -1;
        private int uiLogCount = 0;
        private int uiLogImportantCount = 0;

        [STAThread]
        public static void Main(string[] args)
        {
            // Dynamic resolution of embedded managed DLLs
            AppDomain.CurrentDomain.AssemblyResolve += (sender, eventArgs) =>
            {
                string assemblyName = new AssemblyName(eventArgs.Name).Name + ".dll";
                var executingAssembly = Assembly.GetExecutingAssembly();
                using (Stream stream = executingAssembly.GetManifestResourceStream(assemblyName))
                {
                    if (stream == null) return null;
                    byte[] assemblyData = new byte[stream.Length];
                    stream.Read(assemblyData, 0, assemblyData.Length);
                    return Assembly.Load(assemblyData);
                }
            };

            // 1. Pre-extract and explicitly load native WebView2Loader.dll BEFORE anything touches WebView2!
            PreloadNativeWebView2Loader();

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // 2. Ensure Administrator Privileges (UAC Elevation)
            if (!IsAdministrator())
            {
                var processInfo = new ProcessStartInfo
                {
                    FileName = Application.ExecutablePath,
                    UseShellExecute = true,
                    Verb = "runas"
                };

                try
                {
                    Process.Start(processInfo);
                }
                catch
                {
                    MessageBox.Show(
                        "Для работы перехвата пакетов WinDivert требуются права Администратора.",
                        "Zapret2 - Требуются права Администратора",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
                return;
            }

            KillZombieWinDivert();

            Application.Run(new MainForm());
        }

        private static void PreloadNativeWebView2Loader()
        {
            try
            {
                // Extract WebView2Loader to multiple standard locations
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string tempDir = Path.Combine(Path.GetTempPath(), "Zapret2-GUI-Loader");
                string localAppDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI", "bin");

                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                if (!Directory.Exists(localAppDir)) Directory.CreateDirectory(localAppDir);

                var assembly = Assembly.GetExecutingAssembly();
                using (Stream stream = assembly.GetManifestResourceStream("WebView2Loader.dll"))
                {
                    if (stream != null)
                    {
                        byte[] buffer = new byte[stream.Length];
                        stream.Read(buffer, 0, buffer.Length);

                        string target1 = Path.Combine(tempDir, "WebView2Loader.dll");
                        string target2 = Path.Combine(localAppDir, "WebView2Loader.dll");
                        string target3 = Path.Combine(appDir, "WebView2Loader.dll");

                        try { File.WriteAllBytes(target1, buffer); } catch { }
                        try { File.WriteAllBytes(target2, buffer); } catch { }
                        try { File.WriteAllBytes(target3, buffer); } catch { }

                        // Explicitly Load Native Library into process memory!
                        LoadLibrary(target1);
                        LoadLibrary(target2);
                        LoadLibrary(target3);
                        SetDllDirectory(tempDir);
                    }
                }
            }
            catch { }
        }

        private static bool IsAdministrator()
        {
            var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }

        public static void KillZombieWinDivert()
        {
            try
            {
                Process[] procs = Process.GetProcessesByName("winws");
                foreach (var p in procs)
                {
                    // Ждём фактического завершения: пока процесс жив, он держит
                    // мьютекс Global\winws_arg_* и следующий запуск с тем же
                    // фильтром будет отклонён ядром.
                    try { p.Kill(); p.WaitForExit(3000); } catch { }
                    try { p.Dispose(); } catch { }
                }
            }
            catch { }
        }

        public MainForm()
        {
            this.FormBorderStyle = FormBorderStyle.None;
            this.DoubleBuffered = true;
            this.SetStyle(ControlStyles.ResizeRedraw, true);

            this.Text = "Zapret2 Control Center";
            this.Size = new Size(1040, 720);
            this.MinimumSize = new Size(840, 580);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(11, 15, 25);
            this.ForeColor = Color.White;
            
            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            InitLogging();
            ExtractResources();
            SetupTray();
            InitializeWebView();

            this.FormClosing += MainForm_FormClosing;
        }

        protected override void WndProc(ref Message m)
        {
            const int WM_NCHITTEST = 0x84;
            const int HTCLIENT = 1;
            const int HTLEFT = 10;
            const int HTRIGHT = 11;
            const int HTTOP = 12;
            const int HTTOPLEFT = 13;
            const int HTTOPRIGHT = 14;
            const int HTBOTTOM = 15;
            const int HTBOTTOMLEFT = 16;
            const int HTBOTTOMRIGHT = 17;

            if (m.Msg == WM_NCHITTEST)
            {
                base.WndProc(ref m);
                if ((int)m.Result == HTCLIENT && this.WindowState != FormWindowState.Maximized)
                {
                    Point p = PointToClient(new Point(m.LParam.ToInt32()));
                    int border = 6;

                    if (p.X <= border && p.Y <= border) { m.Result = (IntPtr)HTTOPLEFT; return; }
                    if (p.X >= ClientSize.Width - border && p.Y <= border) { m.Result = (IntPtr)HTTOPRIGHT; return; }
                    if (p.X <= border && p.Y >= ClientSize.Height - border) { m.Result = (IntPtr)HTBOTTOMLEFT; return; }
                    if (p.X >= ClientSize.Width - border && p.Y >= ClientSize.Height - border) { m.Result = (IntPtr)HTBOTTOMRIGHT; return; }
                    if (p.X <= border) { m.Result = (IntPtr)HTLEFT; return; }
                    if (p.X >= ClientSize.Width - border) { m.Result = (IntPtr)HTRIGHT; return; }
                    if (p.Y <= border) { m.Result = (IntPtr)HTTOP; return; }
                    if (p.Y >= ClientSize.Height - border) { m.Result = (IntPtr)HTBOTTOM; return; }
                }
                return;
            }
            base.WndProc(ref m);
        }

        private void ExtractResources()
        {
            try
            {
                string baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI");
                distPath = Path.Combine(baseDir, "dist");
                binPath = Path.Combine(baseDir, "bin");
                listsPath = Path.Combine(baseDir, "host-list");

                if (!Directory.Exists(distPath)) Directory.CreateDirectory(distPath);
                if (!Directory.Exists(binPath)) Directory.CreateDirectory(binPath);
                if (!Directory.Exists(listsPath)) Directory.CreateDirectory(listsPath);

                var assembly = Assembly.GetExecutingAssembly();
                
                // Extract dist.zip
                using (Stream stream = assembly.GetManifestResourceStream("dist.zip"))
                {
                    if (stream != null)
                    {
                        using (ZipArchive archive = new ZipArchive(stream))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string destPath = Path.Combine(distPath, entry.FullName);
                                string dir = Path.GetDirectoryName(destPath);
                                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                if (!string.IsNullOrEmpty(entry.Name))
                                {
                                    try { entry.ExtractToFile(destPath, true); } catch { }
                                }
                            }
                        }
                    }
                }

                // Extract lists.zip -> host-list\
                // Пользовательские файлы (list-user.txt, list-exclude-user.txt) в
                // архив не входят, поэтому распаковка их не затирает.
                ExtractZipResource(assembly, "lists.zip", listsPath);

                MigrateLegacyUserLists();
                EnsureUserLists();

                // Extract bin.zip
                using (Stream stream = assembly.GetManifestResourceStream("bin.zip"))
                {
                    if (stream != null)
                    {
                        using (ZipArchive archive = new ZipArchive(stream))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string destPath = Path.Combine(binPath, entry.FullName);
                                string dir = Path.GetDirectoryName(destPath);
                                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                if (!string.IsNullOrEmpty(entry.Name))
                                {
                                    // Файл может быть занят предыдущим экземпляром — пропускаем,
                                    // распаковка остальных файлов не должна прерываться.
                                    try { entry.ExtractToFile(destPath, true); } catch { }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Resource extraction: " + ex.Message);
            }
        }

        /// <summary>Распаковывает zip-ресурс в указанный каталог.</summary>
        private static void ExtractZipResource(Assembly assembly, string resourceName, string targetDir)
        {
            try
            {
                using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                {
                    if (stream == null) return;
                    using (ZipArchive archive = new ZipArchive(stream))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destPath = Path.Combine(targetDir, entry.FullName);
                            string dir = Path.GetDirectoryName(destPath);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                            if (!string.IsNullOrEmpty(entry.Name))
                            {
                                try { entry.ExtractToFile(destPath, true); } catch { }
                            }
                        }
                    }
                }
            }
            catch { }
        }

        /// <summary>
        /// Создаёт пустые пользовательские списки, если их ещё нет. Ядро
        /// завершается при старте, если любой указанный --hostlist не читается.
        /// </summary>
        private void EnsureUserLists()
        {
            foreach (string name in new string[] { "list-user.txt", "list-exclude-user.txt" })
            {
                try
                {
                    string f = Path.Combine(listsPath, name);
                    if (!File.Exists(f))
                        File.WriteAllText(f, "# Файл создаётся приложением из вкладки «Хостлисты»." + Environment.NewLine, new UTF8Encoding(false));
                }
                catch { }
            }
        }

        /// <summary>
        /// До версии 0.0.5 пользовательские списки лежали в bin\ и затирались
        /// распаковкой ядра. Переносим их один раз в host-list\.
        /// </summary>
        private void MigrateLegacyUserLists()
        {
            foreach (string name in new string[] { "list-user.txt", "list-exclude-user.txt" })
            {
                try
                {
                    string legacy = Path.Combine(binPath, name);
                    string target = Path.Combine(listsPath, name);
                    if (File.Exists(legacy))
                    {
                        if (!File.Exists(target)) File.Move(legacy, target);
                        else File.Delete(legacy);
                    }
                }
                catch { }
            }
        }

        private async void InitializeWebView()
        {
            try
            {
                webView = new WebView2();
                webView.Dock = DockStyle.Fill;
                this.Controls.Add(webView);

                string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI", "WebViewData");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await webView.EnsureCoreWebView2Async(env);

                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.zapret",
                    distPath,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;

                webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
                webView.CoreWebView2.Navigate("https://app.zapret/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Ошибка инициализации WebView2: " + ex.Message, "Ошибка запуска", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void SendToWeb(string json)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(() => SendToWeb(json)));
                return;
            }

            try
            {
                if (webView != null && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.PostWebMessageAsString(json);
                }
            }
            catch { }
        }

        private void SendLog(string level, string message, string source = "WinWS")
        {
            // В файл попадает всё, включая пакетный вывод winws --debug.
            WriteLogFile(level, source, message);

            if (!AllowUiLog(level)) return;

            string time = DateTime.Now.ToString("HH:mm:ss");
            string safeMsg = message.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
            string json = string.Format("{{\"type\":\"log\",\"level\":\"{0}\",\"message\":\"{1}\",\"source\":\"{2}\",\"timestamp\":\"{3}\"}}", level, safeMsg, source, time);
            SendToWeb(json);
        }

        // ================= Файловый лог =====================================

        private void InitLogging()
        {
            try
            {
                logDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Zapret2-GUI", "logs");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);

                logFilePath = Path.Combine(logDir, "zapret2.log");
                OpenLogWriter();

                logThread = new Thread(LogPump);
                logThread.IsBackground = true;
                logThread.Start();

                WriteLogFile("info", "Logger", string.Format(
                    "=== Zapret2 Control Center v{0} запущен, лог: {1} ===", AppVersion, logFilePath));
            }
            catch { }
        }

        private void OpenLogWriter()
        {
            var fs = new FileStream(logFilePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            logBytes = fs.Length;
            logWriter = new StreamWriter(fs, new UTF8Encoding(false));
            logWriter.AutoFlush = false;
        }

        /// <summary>Кладёт строку в очередь на запись. Вызывается из любых потоков.</summary>
        private void WriteLogFile(string level, string source, string message)
        {
            if (logFilePath == null) return;
            if (logQueue.Count > LOG_QUEUE_MAX) return;
            string line = string.Format("{0:yyyy-MM-dd HH:mm:ss.fff} [{1,-7}] [{2}] {3}",
                DateTime.Now, level, source, message);
            logQueue.Enqueue(line);
            try { logSignal.Set(); } catch { }
        }

        /// <summary>Фоновая запись: разгружает чтение stdout winws от дисковых операций.</summary>
        private void LogPump()
        {
            var sb = new StringBuilder();
            while (!logStop)
            {
                logSignal.WaitOne(500);
                logSignal.Reset();

                sb.Length = 0;
                int n = 0;
                string line;
                while (n < 2000 && logQueue.TryDequeue(out line))
                {
                    sb.Append(line).Append("\r\n");
                    n++;
                }
                if (n == 0) continue;

                try
                {
                    lock (this)
                    {
                        if (logWriter == null) continue;
                        logWriter.Write(sb.ToString());
                        logWriter.Flush();
                        logBytes += Encoding.UTF8.GetByteCount(sb.ToString());
                        if (logBytes >= LOG_MAX_BYTES) RotateLog();
                    }
                }
                catch { }
            }

            try { lock (this) { if (logWriter != null) { logWriter.Flush(); logWriter.Dispose(); logWriter = null; } } }
            catch { }
        }

        /// <summary>Закрывает текущий лог, упаковывает его в zip и начинает новый.</summary>
        private void RotateLog()
        {
            try
            {
                logWriter.Flush();
                logWriter.Dispose();
                logWriter = null;

                string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
                string rotated = Path.Combine(logDir, "zapret2-" + stamp + ".log");
                File.Move(logFilePath, rotated);

                string zipPath = Path.Combine(logDir, "zapret2-" + stamp + ".log.zip");
                using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
                {
                    zip.CreateEntryFromFile(rotated, Path.GetFileName(rotated), CompressionLevel.Optimal);
                }
                File.Delete(rotated);

                PruneLogArchives();
            }
            catch { }
            finally
            {
                try { OpenLogWriter(); } catch { }
            }
        }

        private void PruneLogArchives()
        {
            try
            {
                var files = new DirectoryInfo(logDir).GetFiles("zapret2-*.log.zip");
                Array.Sort(files, (x, y) => y.LastWriteTimeUtc.CompareTo(x.LastWriteTimeUtc));
                for (int i = LOG_KEEP_ARCHIVES; i < files.Length; i++)
                {
                    try { files[i].Delete(); } catch { }
                }
            }
            catch { }
        }

        private void ShutdownLogging()
        {
            try
            {
                WriteLogFile("info", "Logger", "=== Приложение завершает работу ===");
                logStop = true;
                logSignal.Set();
                if (logThread != null) logThread.Join(2000);
            }
            catch { }
        }

        /// <summary>Разрешено ли отправить эту строку в интерфейс (защита от потопа).</summary>
        private bool AllowUiLog(string level)
        {
            int sec = (int)(DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond);
            if (sec != uiLogSecond)
            {
                uiLogSecond = sec;
                uiLogCount = 0;
                uiLogImportantCount = 0;
            }

            bool important = level == "error" || level == "warn" || level == "success";
            if (important) return ++uiLogImportantCount <= UI_LOG_IMPORTANT_PER_SEC;
            return ++uiLogCount <= UI_LOG_PER_SEC;
        }

        /// <summary>
        /// Записывает домены, добавленные пользователем на вкладке «Хостлисты»,
        /// в файлы рядом с winws.exe. Формат сообщения из веб-слоя:
        /// список включений, строка-разделитель #EXCLUDE#, список исключений.
        /// </summary>
        private void SaveUserLists(string payload)
        {
            try
            {
                string dir = listsPath;
                if (string.IsNullOrEmpty(dir)) return;
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                string include = payload, exclude = "";
                int sep = payload.IndexOf("#EXCLUDE#", StringComparison.Ordinal);
                if (sep >= 0)
                {
                    include = payload.Substring(0, sep);
                    exclude = payload.Substring(sep + "#EXCLUDE#".Length);
                }

                WriteListFile(Path.Combine(dir, "list-user.txt"), include);
                WriteListFile(Path.Combine(dir, "list-exclude-user.txt"), exclude);
            }
            catch (Exception ex)
            {
                SendLog("error", "Не удалось сохранить пользовательские списки: " + ex.Message, "Hostlist");
            }
        }

        private void WriteListFile(string path, string body)
        {
            var sb = new StringBuilder();
            sb.Append("# Файл создаётся приложением из вкладки «Хостлисты». Правки будут перезаписаны.\r\n");
            int count = 0;
            foreach (string raw in body.Split('\n'))
            {
                string d = raw.Trim();
                if (d.Length == 0 || d.StartsWith("#")) continue;
                sb.Append(d).Append("\r\n");
                count++;
            }
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
            SendLog("info", string.Format("{0}: записано доменов — {1}", Path.GetFileName(path), count), "Hostlist");
        }

        /// <summary>Выгрузка списка доменов в текстовый файл по выбору пользователя.</summary>
        private void ExportHostlist(string payload)
        {
            using (var dlg = new SaveFileDialog())
            {
                dlg.Title = "Сохранить список доменов";
                dlg.Filter = "Список доменов (*.txt)|*.txt|Все файлы (*.*)|*.*";
                dlg.FileName = "zapret2-hostlist.txt";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;

                try
                {
                    File.WriteAllText(dlg.FileName, payload.Replace("\n", "\r\n"), new UTF8Encoding(false));
                    SendLog("success", "Список сохранён: " + dlg.FileName, "Hostlist");
                }
                catch (Exception ex)
                {
                    SendLog("error", "Ошибка экспорта: " + ex.Message, "Hostlist");
                }
            }
        }

        /// <summary>Загрузка списка доменов из файла и передача его в интерфейс.</summary>
        private void ImportHostlist()
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Title = "Выберите файл со списком доменов";
                dlg.Filter = "Список доменов (*.txt)|*.txt|Все файлы (*.*)|*.*";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;

                try
                {
                    string[] lines = File.ReadAllLines(dlg.FileName, Encoding.UTF8);
                    var sb = new StringBuilder();
                    sb.Append("{\"type\":\"hostlist_import\",\"domains\":[");
                    int n = 0;
                    foreach (string raw in lines)
                    {
                        string d = raw.Trim();
                        // Пропускаем комментарии и служебные префиксы zapret.
                        if (d.Length == 0 || d.StartsWith("#") || d.StartsWith("//")) continue;
                        if (d.StartsWith("^")) d = d.Substring(1);
                        if (d.Length == 0) continue;
                        if (n > 0) sb.Append(',');
                        sb.Append('"').Append(d.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append('"');
                        n++;
                        if (n >= 5000) break;
                    }
                    sb.Append("]}");
                    SendToWeb(sb.ToString());
                    SendLog("success", string.Format("Импортировано доменов: {0} из {1}", n, Path.GetFileName(dlg.FileName)), "Hostlist");
                }
                catch (Exception ex)
                {
                    SendLog("error", "Ошибка импорта: " + ex.Message, "Hostlist");
                }
            }
        }

        /// <summary>
        /// Сохраняет пресеты в .json. Содержимое приходит из веб-слоя в base64:
        /// внутри JSON с кириллицей и кавычками, и так его не нужно экранировать
        /// дважды при передаче через строковое сообщение WebView2.
        /// </summary>
        private void ExportPresets(string base64)
        {
            string json;
            try
            {
                json = Encoding.UTF8.GetString(Convert.FromBase64String(base64));
            }
            catch (Exception ex)
            {
                SendLog("error", "Некорректные данные для экспорта: " + ex.Message, "Presets");
                return;
            }

            using (var dlg = new SaveFileDialog())
            {
                dlg.Title = "Сохранить пресеты";
                dlg.Filter = "Пресеты Zapret2 (*.json)|*.json|Все файлы (*.*)|*.*";
                dlg.FileName = "zapret2-presets.json";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;

                try
                {
                    File.WriteAllText(dlg.FileName, json, new UTF8Encoding(false));
                    SendLog("success", "Пресеты сохранены: " + dlg.FileName, "Presets");
                }
                catch (Exception ex)
                {
                    SendLog("error", "Ошибка экспорта пресетов: " + ex.Message, "Presets");
                }
            }
        }

        /// <summary>Читает файл пресетов и отдаёт его в интерфейс как base64.</summary>
        private void ImportPresets()
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Title = "Выберите файл с пресетами";
                dlg.Filter = "Пресеты Zapret2 (*.json)|*.json|Все файлы (*.*)|*.*";
                if (dlg.ShowDialog(this) != DialogResult.OK) return;

                try
                {
                    var info = new FileInfo(dlg.FileName);
                    if (info.Length > 2 * 1024 * 1024)
                    {
                        SendLog("error", "Файл слишком большой для файла пресетов (>2 МБ).", "Presets");
                        return;
                    }

                    string json = File.ReadAllText(dlg.FileName, Encoding.UTF8);
                    string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
                    SendToWeb("{\"type\":\"presets_import\",\"b64\":\"" + b64 + "\"}");
                    SendLog("info", "Файл пресетов прочитан: " + Path.GetFileName(dlg.FileName), "Presets");
                }
                catch (Exception ex)
                {
                    SendLog("error", "Ошибка импорта пресетов: " + ex.Message, "Presets");
                }
            }
        }

        private void OpenLogsFolder()
        {
            try
            {
                if (logDir != null && !Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                if (logDir != null) Process.Start("explorer.exe", logDir);
            }
            catch { }
        }

        /// <summary>
        /// Подставляет вместо маркера {LISTS} абсолютный путь к каталогу списков
        /// и заключает значение в кавычки.
        ///
        /// Относительные пути вида ../host-list/x.txt ядро не принимает: на
        /// разборе --ipset оно завершается с "cannot access ipset file", хотя
        /// файл существует. Абсолютный путь такой неоднозначности не оставляет.
        /// Слеши прямые: так значение безопасно для разбора командной строки
        /// cygwin-сборкой winws.
        /// </summary>
        private string ResolveListPaths(string args)
        {
            if (string.IsNullOrEmpty(listsPath)) return args;
            string root = listsPath.Replace('\\', '/').TrimEnd('/');

            return Regex.Replace(args, @"(--[a-z0-9\-]+=)\{LISTS\}/(\S+)", m =>
                m.Groups[1].Value + "\"" + root + "/" + m.Groups[2].Value + "\"");
        }

        /// <summary>
        /// Проверяет, что все файлы списков, на которые ссылается команда,
        /// действительно существуют. Ядро в таком случае просто завершается,
        /// поэтому понятную причину лучше показать заранее.
        /// </summary>
        private bool CheckListFiles(string args)
        {
            bool ok = true;
            foreach (Match m in Regex.Matches(args, "--(?:hostlist|hostlist-exclude|ipset|ipset-exclude)=\"([^\"]+)\""))
            {
                string f = m.Groups[1].Value;
                if (!File.Exists(f))
                {
                    SendLog("error", "Файл списка не найден: " + f, "Hostlist");
                    ok = false;
                }
            }
            return ok;
        }

        private void SendStatus(string status, int pid)
        {
            SendToWeb(string.Format("{{\"type\":\"status_change\",\"status\":\"{0}\",\"pid\":{1}}}", status, pid));
        }

        /// <summary>Путь к winws.exe: сначала распакованная копия, затем каталог рядом с приложением.</summary>
        /// <summary>
        /// Предупреждает, если в Windows включён системный прокси.
        ///
        /// Это не мелочь, а принципиальное ограничение. При включённом прокси
        /// приложения (браузеры, Discord, Telegram Desktop) отправляют HTTP(S)
        /// не на адрес сайта, а на прокси — обычно на 127.0.0.1. Фильтр
        /// WinDivert начинается с "!impostor and !loopback", поэтому такой
        /// трафик winws НЕ ВИДИТ и повлиять на него не может: в логе будут
        /// нули, а переключение стратегий ничего не изменит.
        ///
        /// Через прокси при этом не идёт UDP: голос Discord и QUIC остаются
        /// задачей обхода.
        /// </summary>
        private void WarnIfSystemProxy()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Internet Settings"))
                {
                    if (key == null) return;

                    object enabled = key.GetValue("ProxyEnable");
                    object server = key.GetValue("ProxyServer");
                    if (enabled == null || Convert.ToInt32(enabled) == 0) return;

                    string addr = (server as string) ?? string.Empty;
                    if (addr.Length == 0) return;

                    SendLog("warn", "В Windows включён системный прокси: " + addr, "Proxy");
                    SendLog("warn",
                        "HTTP(S)-трафик приложений уходит на прокси, а не напрямую. " +
                        "Такой трафик идёт через loopback, который фильтр WinDivert " +
                        "исключает, поэтому обход его НЕ ВИДИТ и не обрабатывает.",
                        "Proxy");
                    SendLog("info",
                        "Через прокси не идёт UDP: голос Discord и QUIC по-прежнему " +
                        "обрабатываются обходом.",
                        "Proxy");
                }
            }
            catch { }
        }

        private string ResolveWinwsDir()
        {
            if (!string.IsNullOrEmpty(binPath) && File.Exists(Path.Combine(binPath, "winws.exe")))
                return binPath;

            string local = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin");
            if (File.Exists(Path.Combine(local, "winws.exe")))
                return local;

            return null;
        }

        /// <summary>
        /// Снимает подвисший драйвер WinDivert. Нужен, когда после аварийного
        /// завершения winws в системе остаётся служба со старой версией драйвера,
        /// из-за которой новый запуск падает с "windivert: driver load failed".
        /// </summary>
        private void ResetWinDivertService()
        {
            foreach (string service in new string[] { "windivert", "WinDivert14", "WinDivert" })
            {
                RunSilent("sc.exe", "stop " + service);
                RunSilent("sc.exe", "delete " + service);
            }
        }

        private static void RunSilent(string exe, string args)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, args)
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (var p = Process.Start(psi))
                {
                    if (p != null)
                    {
                        p.StandardOutput.ReadToEnd();
                        p.StandardError.ReadToEnd();
                        p.WaitForExit(4000);
                    }
                }
            }
            catch { }
        }

        private void HandleWinwsOutput(string line, bool isError)
        {
            if (string.IsNullOrEmpty(line)) return;

            string lower = line.ToLowerInvariant();
            // Эвристика намеренно узкая: с --debug ядро печатает тысячи строк
            // о пакетах, и широкий поиск слова "error" красил бы половину лога.
            bool looksBad =
                lower.Contains("could not") || lower.Contains("must specify") ||
                lower.Contains("value error") || lower.Contains("invalid argument") ||
                lower.Contains("driver load") || lower.Contains("already running") ||
                lower.Contains("out of memory") || lower.StartsWith("error");

            if (isError || looksBad)
            {
                lock (lastErrors)
                {
                    lastErrors.Add(line);
                    if (lastErrors.Count > 12) lastErrors.RemoveAt(0);
                }
                SendLog("error", line, "WinWS");
            }
            else
            {
                SendLog("info", line, "WinWS");
            }
        }

        /// <summary>
        /// Запускает ядро winws.exe с переданными аргументами и достоверно
        /// сообщает интерфейсу, поднялось оно или нет.
        /// </summary>
        private void StartZapretProcess(string arguments)
        {
            StopZapretProcess(false);

            string dir = ResolveWinwsDir();
            if (dir == null)
            {
                SendLog("error", "winws.exe не найден. Ожидался каталог: " + (binPath ?? "(не задан)"), "Core");
                SendStatus("error", 0);
                return;
            }

            string cleanArgs = (arguments ?? string.Empty).Trim();
            if (cleanArgs.StartsWith("winws.exe", StringComparison.OrdinalIgnoreCase))
                cleanArgs = cleanArgs.Substring("winws.exe".Length).Trim();

            // Без фильтра захвата WinDivert ядро завершается сразу:
            // "windivert filter : must specify port or/and partial raw filter".
            // Интерфейс всегда передаёт --wf-*, но подстраховываемся на случай
            // пресета, отредактированного вручную.
            if (!cleanArgs.Contains("--wf-tcp") && !cleanArgs.Contains("--wf-udp") && !cleanArgs.Contains("--wf-raw"))
            {
                cleanArgs = "--wf-tcp=80,443 --wf-udp=443,50000-65535 " + cleanArgs;
                SendLog("warn", "В строке запуска не было --wf-tcp/--wf-udp, добавлен фильтр по умолчанию.", "Runner");
            }

            if (cleanArgs.Length == 0)
            {
                SendLog("error", "Пустая строка аргументов - запускать нечего.", "Runner");
                SendStatus("error", 0);
                return;
            }

            cleanArgs = ResolveListPaths(cleanArgs);

            if (!CheckListFiles(cleanArgs))
            {
                SendLog("error", "Запуск отменён: не хватает файлов списков в " + listsPath, "Runner");
                SendStatus("error", 0);
                return;
            }

            lock (lastErrors) { lastErrors.Clear(); }
            stopRequested = false;

            WarnIfSystemProxy();
            SendLog("info", "Рабочий каталог ядра: " + dir, "Runner");
            SendLog("info", "winws.exe " + cleanArgs, "Runner");

            Process p;
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = Path.Combine(dir, "winws.exe"),
                    Arguments = cleanArgs,
                    WorkingDirectory = dir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                p = new Process();
                p.StartInfo = psi;
                p.EnableRaisingEvents = true;
                p.OutputDataReceived += (s2, e2) => HandleWinwsOutput(e2.Data, false);
                p.ErrorDataReceived += (s2, e2) => HandleWinwsOutput(e2.Data, true);
                p.Exited += WinwsExited;

                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                SendLog("error", "Не удалось запустить winws.exe: " + ex.Message, "Core");
                SendStatus("error", 0);
                return;
            }

            lock (procLock) { winws = p; }

            // Ядро проверяет аргументы и открывает драйвер за доли секунды.
            // Если оно живо через 1,5 с - обход действительно работает.
            if (p.WaitForExit(1500))
            {
                lock (procLock) { winws = null; }

                int exitCode = 0;
                try { exitCode = p.ExitCode; } catch { }

                string reason = CollectErrors();
                SendLog("error", string.Format("winws.exe завершился с кодом {0}. Обход НЕ активен.", exitCode), "Core");

                if (reason.IndexOf("driver", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    reason.IndexOf("windivert", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    SendLog("warn", "Похоже, в системе висит старая служба WinDivert. Пробую удалить её...", "WinDivert");
                    ResetWinDivertService();
                    SendLog("warn", "Служба WinDivert сброшена. Нажмите Включить ещё раз.", "WinDivert");
                }
                else if (reason.Length == 0)
                {
                    SendLog("warn", "Ядро не вернуло текст ошибки. Включите Подробный лог и повторите запуск.", "Runner");
                }

                SendStatus("error", 0);
                return;
            }

            SendLog("success", string.Format("winws.exe работает (PID {0})", p.Id), "WinWS");
            SendLog("info", "Драйвер WinDivert загружен, трафик фильтруется.", "WinDivert");
            SendStatus("connected", p.Id);
        }

        private string CollectErrors()
        {
            lock (lastErrors)
            {
                return lastErrors.Count == 0 ? string.Empty : string.Join(" | ", lastErrors.ToArray());
            }
        }

        /// <summary>Реакция на самопроизвольное завершение ядра (падение, конфликт драйвера).</summary>
        private void WinwsExited(object sender, EventArgs e)
        {
            Process p = sender as Process;
            lock (procLock)
            {
                if (!ReferenceEquals(winws, p)) return;
                winws = null;
            }

            if (stopRequested) return;

            int code = 0;
            try { if (p != null) code = p.ExitCode; } catch { }
            SendLog("error", string.Format("Ядро winws.exe неожиданно завершилось (код {0}). Обход отключён.", code), "Core");
            SendStatus("error", 0);
        }

        private void StopZapretProcess()
        {
            StopZapretProcess(true);
        }

        private void StopZapretProcess(bool notify)
        {
            stopRequested = true;

            Process p;
            lock (procLock)
            {
                p = winws;
                winws = null;
            }

            if (p != null)
            {
                try
                {
                    p.Exited -= WinwsExited;
                    if (!p.HasExited)
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                }
                catch { }
                try { p.Dispose(); } catch { }
            }

            // Подчищаем экземпляры, оставшиеся от прошлых сессий.
            KillZombieWinDivert();

            if (notify)
            {
                SendLog("info", "Обход остановлен, процессы winws.exe завершены.", "Runner");
                SendStatus("disconnected", 0);
            }
        }

        private void RunRealDiagnostics()
        {
            Task.Run(async () =>
            {
                SendLog("info", "Запуск сетевой диагностики...", "Diagnostics");

                string[] targets = { "youtube.com", "rr1---sn-4g5ednss.googlevideo.com", "gateway.discord.gg", "rotterdam.discord.media" };
                string[] targetIds = { "yt-web", "yt-video", "dc-gateway", "dc-voice" };

                for (int i = 0; i < targets.Length; i++)
                {
                    string target = targets[i];
                    string targetId = targetIds[i];

                    // Шаг 1. DNS
                    var sw = Stopwatch.StartNew();
                    string ipStr = null;
                    try
                    {
                        var ips = await Dns.GetHostAddressesAsync(target);
                        sw.Stop();
                        if (ips.Length > 0)
                        {
                            ipStr = ips[0].ToString();
                            SendDiagnosticStep(targetId, 0, "success", ipStr, (int)sw.ElapsedMilliseconds);
                        }
                        else
                        {
                            SendDiagnosticStep(targetId, 0, "error", "DNS не вернул адресов", (int)sw.ElapsedMilliseconds);
                        }
                    }
                    catch (Exception ex)
                    {
                        sw.Stop();
                        SendDiagnosticStep(targetId, 0, "error", "DNS: " + ex.Message, (int)sw.ElapsedMilliseconds);
                    }

                    if (ipStr == null)
                    {
                        // Без адреса остальные шаги смысла не имеют.
                        SendDiagnosticStep(targetId, 1, "error", "Пропущено: адрес не определён", 0);
                        SendDiagnosticStep(targetId, 2, "error", "Пропущено: адрес не определён", 0);
                        SendDiagnosticStep(targetId, 3, "error", "Пропущено: адрес не определён", 0);
                        await Task.Delay(200);
                        continue;
                    }

                    // Шаг 2. TCP 443
                    sw.Restart();
                    bool tcpOk = false;
                    try
                    {
                        using (var tcp = new TcpClient())
                        {
                            var connectTask = tcp.ConnectAsync(target, 443);
                            if (await Task.WhenAny(connectTask, Task.Delay(3000)) == connectTask && tcp.Connected)
                            {
                                sw.Stop();
                                tcpOk = true;
                                SendDiagnosticStep(targetId, 1, "success", ipStr + " отвечает на порту 443", (int)sw.ElapsedMilliseconds);
                            }
                            else
                            {
                                sw.Stop();
                                SendDiagnosticStep(targetId, 1, "blocked", "Таймаут TCP-соединения", (int)sw.ElapsedMilliseconds);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        sw.Stop();
                        SendDiagnosticStep(targetId, 1, "error", ex.Message, (int)sw.ElapsedMilliseconds);
                    }

                    if (!tcpOk)
                    {
                        SendDiagnosticStep(targetId, 2, "error", "Пропущено: нет TCP-соединения", 0);
                        SendDiagnosticStep(targetId, 3, "error", "Пропущено: нет TCP-соединения", 0);
                        await Task.Delay(200);
                        continue;
                    }

                    // Шаг 3. Контрольное TLS-рукопожатие с посторонним SNI.
                    bool controlOk = await TlsHandshake(targetId, 2, target, "fake-control-test.org");

                    // Шаг 4. TLS-рукопожатие с настоящим именем.
                    bool realOk = await TlsHandshake(targetId, 3, target, target);

                    if (controlOk && !realOk)
                    {
                        SendLog("warn", string.Format("[{0}] соединение рвётся именно по имени сайта (SNI) — типичная блокировка DPI.", target), "Diagnostics");
                    }
                    else if (!controlOk && !realOk)
                    {
                        SendLog("warn", string.Format("[{0}] TLS не проходит ни с каким именем — блокировка по IP или проблема сети.", target), "Diagnostics");
                    }
                    else if (realOk)
                    {
                        SendLog("success", string.Format("[{0}] TLS-рукопожатие проходит успешно.", target), "Diagnostics");
                    }

                    await Task.Delay(200);
                }

                SendLog("success", "Диагностика завершена.", "Diagnostics");
                SendToWeb("{\"type\":\"diagnostics_completed\"}");
            });
        }

        /// <summary>
        /// Выполняет TLS-рукопожатие с указанным SNI и честно сообщает результат.
        /// Возвращает true, если рукопожатие состоялось.
        /// </summary>
        private async Task<bool> TlsHandshake(string targetId, int stepIndex, string host, string sni)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                using (var tcp = new TcpClient())
                {
                    var connectTask = tcp.ConnectAsync(host, 443);
                    if (await Task.WhenAny(connectTask, Task.Delay(3000)) != connectTask)
                    {
                        sw.Stop();
                        SendDiagnosticStep(targetId, stepIndex, "blocked", "Таймаут TCP перед TLS", (int)sw.ElapsedMilliseconds);
                        return false;
                    }
                    await connectTask;

                    using (var ssl = new SslStream(tcp.GetStream(), false, (a, b, c, d) => true))
                    {
                        var tls = ssl.AuthenticateAsClientAsync(sni);
                        if (await Task.WhenAny(tls, Task.Delay(5000)) != tls)
                        {
                            sw.Stop();
                            SendDiagnosticStep(targetId, stepIndex, "blocked", "Таймаут TLS-рукопожатия", (int)sw.ElapsedMilliseconds);
                            return false;
                        }
                        await tls;
                        sw.Stop();
                        SendDiagnosticStep(targetId, stepIndex, "success",
                            string.Format("Рукопожатие прошло ({0})", ssl.SslProtocol), (int)sw.ElapsedMilliseconds);
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                sw.Stop();
                var inner = ex;
                while (inner.InnerException != null) inner = inner.InnerException;
                SendDiagnosticStep(targetId, stepIndex, "blocked", inner.Message, (int)sw.ElapsedMilliseconds);
                return false;
            }
        }

        private void SendDiagnosticStep(string targetId, int stepIndex, string status, string detail, int latency)
        {
            string safeDetail = detail.Replace("\\", "\\\\").Replace("\"", "\\\"");
            string json = string.Format("{{\"type\":\"diag_step\",\"targetId\":\"{0}\",\"stepIndex\":{1},\"status\":\"{2}\",\"detail\":\"{3}\",\"latencyMs\":{4}}}",
                targetId, stepIndex, status, safeDetail, latency);
            SendToWeb(json);
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string rawMsg = e.TryGetWebMessageAsString();
                this.BeginInvoke(new Action(() =>
                {
                    if (rawMsg == "drag")
                    {
                        if (this.WindowState == FormWindowState.Maximized)
                        {
                            int mouseX = Cursor.Position.X;
                            int mouseY = Cursor.Position.Y;
                            this.WindowState = FormWindowState.Normal;
                            this.Left = mouseX - (this.Width / 2);
                            this.Top = Math.Max(0, mouseY - 15);
                        }

                        ReleaseCapture();
                        SendMessage(this.Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
                    }
                    else if (rawMsg == "minimize")
                    {
                        this.WindowState = FormWindowState.Minimized;
                    }
                    else if (rawMsg == "maximize")
                    {
                        ToggleMaximize();
                    }
                    else if (rawMsg == "minimize_to_tray")
                    {
                        this.Hide();
                        if (trayIcon != null)
                        {
                            trayIcon.ShowBalloonTip(2000, "Zapret2 свернут в трей", "Обход DPI продолжает работать в фоне. Нажмите на иконку для открытия.", ToolTipIcon.Info);
                        }
                    }
                    else if (rawMsg == "open_app_folder")
                    {
                        string appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI");
                        if (!Directory.Exists(appDataDir)) Directory.CreateDirectory(appDataDir);
                        Process.Start("explorer.exe", appDataDir);
                    }
                    else if (rawMsg == "open_logs_folder")
                    {
                        OpenLogsFolder();
                    }
                    else if (rawMsg.StartsWith("save_lists:"))
                    {
                        SaveUserLists(rawMsg.Substring("save_lists:".Length));
                    }
                    else if (rawMsg.StartsWith("export_hostlist:"))
                    {
                        ExportHostlist(rawMsg.Substring("export_hostlist:".Length));
                    }
                    else if (rawMsg == "import_hostlist")
                    {
                        ImportHostlist();
                    }
                    else if (rawMsg.StartsWith("export_presets:"))
                    {
                        ExportPresets(rawMsg.Substring("export_presets:".Length));
                    }
                    else if (rawMsg == "import_presets")
                    {
                        ImportPresets();
                    }
                    else if (rawMsg.StartsWith("open_url:"))
                    {
                        string url = rawMsg.Substring("open_url:".Length);
                        // Открываем только http(s) — сообщение приходит из веб-слоя.
                        if (url.StartsWith("https://") || url.StartsWith("http://"))
                        {
                            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
                        }
                    }
                    else if (rawMsg.StartsWith("start_engine:"))
                    {
                        string cmdArgs = rawMsg.Substring("start_engine:".Length);
                        StartZapretProcess(cmdArgs);
                    }
                    else if (rawMsg == "stop_engine")
                    {
                        StopZapretProcess();
                    }
                    else if (rawMsg == "run_diagnostics")
                    {
                        RunRealDiagnostics();
                    }
                    else if (rawMsg == "close")
                    {
                        isExiting = true;
                        StopZapretProcess();
                        KillZombieWinDivert();
                        ShutdownLogging();
                        if (trayIcon != null)
                        {
                            trayIcon.Visible = false;
                            trayIcon.Dispose();
                        }
                        Application.Exit();
                    }
                }));
            }
            catch { }
        }

        private void ToggleMaximize()
        {
            if (this.WindowState == FormWindowState.Maximized)
            {
                this.WindowState = FormWindowState.Normal;
            }
            else
            {
                Rectangle workingArea = Screen.FromHandle(this.Handle).WorkingArea;
                this.MaximizedBounds = new Rectangle(0, 0, workingArea.Width, workingArea.Height);
                this.WindowState = FormWindowState.Maximized;
            }
        }

        private void SetupTray()
        {
            try
            {
                trayMenu = new ContextMenu();
                trayMenu.MenuItems.Add("Открыть Zapret2", (s, e) => {
                    this.Show();
                    this.WindowState = FormWindowState.Normal;
                    this.BringToFront();
                });
                trayMenu.MenuItems.Add("Открыть папку логов", (s, e) => {
                    OpenLogsFolder();
                });
                trayMenu.MenuItems.Add("Открыть папку с файлами ядра", (s, e) => {
                    string appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI");
                    if (!Directory.Exists(appDataDir)) Directory.CreateDirectory(appDataDir);
                    Process.Start("explorer.exe", appDataDir);
                });
                trayMenu.MenuItems.Add("Очистить зависшие процессы WinDivert", (s, e) => {
                    StopZapretProcess();
                    KillZombieWinDivert();
                    trayIcon.ShowBalloonTip(1500, "Zapret2 Watchdog", "Процессы winws успешно очищены", ToolTipIcon.Info);
                });
                trayMenu.MenuItems.Add("-");
                trayMenu.MenuItems.Add("Выход", (s, e) => {
                    isExiting = true;
                    StopZapretProcess();
                    KillZombieWinDivert();
                    ShutdownLogging();
                    if (trayIcon != null)
                    {
                        trayIcon.Visible = false;
                        trayIcon.Dispose();
                    }
                    Application.Exit();
                });

                trayIcon = new NotifyIcon();
                trayIcon.Text = "Zapret2 Control Center";
                try
                {
                    trayIcon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
                catch { }
                trayIcon.ContextMenu = trayMenu;
                trayIcon.Visible = true;

                trayIcon.DoubleClick += (s, e) => {
                    this.Show();
                    this.WindowState = FormWindowState.Normal;
                    this.BringToFront();
                };
            }
            catch { }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (!isExiting)
            {
                e.Cancel = true;
                this.Hide();
                if (trayIcon != null)
                {
                    trayIcon.ShowBalloonTip(2000, "Zapret2 свернут в трей", "Обход DPI продолжает работать в фоне. Нажмите на иконку для открытия.", ToolTipIcon.Info);
                }
            }
            else
            {
                StopZapretProcess();
                KillZombieWinDivert();
                ShutdownLogging();
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
            }
        }
    }
}
