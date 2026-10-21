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
using System.ServiceProcess;
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

        [DllImport("user32.dll")]
        private static extern bool AllowSetForegroundWindow(int dwProcessId);

        // ---- Значок -----------------------------------------------------------
        //
        // Icon.ExtractAssociatedIcon отдаёт только кадр 32 px, и Windows ужимает
        // его в трей — «Z2» расплывается. В app.ico мелкие кадры (16, 20, 24)
        // нарисованы под свою пиксельную сетку; SHDefExtractIcon достаёт кадр
        // ровно нужного размера (и понимает PNG-кадры, в отличие от new Icon).
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern int SHDefExtractIcon(string pszIconFile, int iIndex, uint uFlags,
            out IntPtr phiconLarge, out IntPtr phiconSmall, uint nIconSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr hIcon);

        private const int SM_CXICON = 11;
        private const int SM_CXSMICON = 49;

        /// <summary>
        /// Значок программы размером под текущий масштаб экрана: обычный
        /// (окно, Alt+Tab) или маленький (трей). Описатель не освобождается —
        /// значков два на всё время жизни процесса.
        /// </summary>
        private static Icon LoadAppIcon(bool small)
        {
            try
            {
                int size = GetSystemMetrics(small ? SM_CXSMICON : SM_CXICON);
                IntPtr large, unused;
                if (size > 0 && SHDefExtractIcon(Application.ExecutablePath, 0, 0,
                        out large, out unused, (uint)(size | (size << 16))) == 0 && large != IntPtr.Zero)
                {
                    if (unused != IntPtr.Zero) DestroyIcon(unused);
                    return Icon.FromHandle(large);
                }
            }
            catch { }
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }

        // ---- Один экземпляр ------------------------------------------------
        //
        // Вторая копия программы убивала обход первой. При старте Main снимает
        // все winws.exe (KillZombieWinDivert — чтобы не оставались процессы от
        // упавших сеансов), а защиты от повторного запуска не было. Типичный
        // путь новичка: нажал крестик — программа ушла в трей и продолжила
        // работать; запустил exe снова — вторая копия молча сняла ядро первой,
        // и мост Telegram во второй не поднимался: порт 1443 занят первой.
        // Так было в журнале тестера из Петербурга 24.09: два запуска за 11 с
        // без закрытия между ними.
        //
        // Теперь вторая копия находит первую по именованному мьютексу, просит
        // её показать окно и выходит, ничего не тронув. Все копии работают с
        // правами администратора (requireAdministrator в манифесте), поэтому
        // объекты в пространстве Local\ доступны друг другу без оговорок.
        private const string InstanceMutexName = @"Local\Zapret2-GUI-Instance";
        private const string InstanceShowEventName = @"Local\Zapret2-GUI-Show";
        /// <summary>Держится всё время жизни процесса — пока он жив, копия одна.</summary>
        private static Mutex instanceMutex;
        /// <summary>Сигнал от второй копии: «покажи окно».</summary>
        private static EventWaitHandle instanceShowEvent;

        /// <summary>Версия сборки. Показывается в логе и в заголовке окна.</summary>
        public const string AppVersion = "0.5.1";

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
        /// <summary>
        /// Ядро, пережившее проверку на старте. Падение до неё разбирает сам
        /// запуск — это ошибка настройки, а не авария, и перезапускать нечего.
        /// </summary>
        private Process confirmedCore;
        /// <summary>Последние строки stderr winws — нужны для внятного сообщения об ошибке.</summary>
        private readonly System.Collections.Generic.List<string> lastErrors = new System.Collections.Generic.List<string>();
        private readonly object procLock = new object();
        /// <summary>Останов инициирован пользователем — не считать выход процесса аварией.</summary>
        private bool stopRequested = false;

        // ---- Перезапуск упавшего ядра ------------------------------------
        // Раньше падение winws молча выключало обход: в журнал строка, кнопка
        // краснеет, а программа обычно свёрнута в трей — Discord просто
        // отваливался. Теперь ядро поднимается заново с нарастающей паузой.
        // Серия ограничена: если ядро падает сразу после каждого запуска,
        // долбить драйвер бесконечно бессмысленно.
        /// <summary>Аргументы последнего запуска не из автоподбора — с ними и перезапускаем.</summary>
        private string lastCoreArgs;
        private DateTime coreStartedUtc = DateTime.MinValue;
        /// <summary>Сколько перезапусков подряд уже сделано в текущей серии.</summary>
        private int coreRestartAttempt = 0;
        private System.Threading.Timer coreRestartTimer;
        /// <summary>Растёт при каждой отмене: сработавший таймер старого поколения ничего не делает.</summary>
        private int coreRestartGen = 0;
        private static readonly int[] CoreRestartDelaysSec = { 3, 10, 30, 60, 120 };
        /// <summary>Проработало столько — значит, ядро было здоровым, серия падений начинается заново.</summary>
        private const int CoreStableSec = 300;

        /// <summary>Процессы других обходчиков: они держат тот же драйвер WinDivert.</summary>
        private static readonly string[] RivalBypassNames = { "goodbyedpi", "GoodbyeDPI", "zapret", "ByeDPI", "byedpi", "spoofdpi" };

        // ---- Файловый лог с ротацией -------------------------------------
        /// <summary>Порог ротации: при превышении лог упаковывается в zip.</summary>
        private const long LOG_MAX_BYTES = 10L * 1024 * 1024;
        /// <summary>Сколько zip-архивов держать в папке логов.</summary>
        private const int LOG_KEEP_ARCHIVES = 10;

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

        // ---- Трассировка ядра — отдельным файлом -------------------------
        // С --debug ядро печатает каждую проверку списка, каждое поле TLS и
        // заголовок пакета: 10 МБ за 20 минут. В общем журнале это затирало
        // всё остальное — десять архивов вмещали три часа, а с автозапуском
        // программа работает сутками. Теперь поток ядра пишется в свой
        // кольцевой файл, а в zapret2.log попадают запуск ядра, его ошибки
        // и сводка раз в 10 минут.
        //
        // Кольцо — два файла по 25 МБ. Замер 0.5.1-test: обычная нагрузка —
        // 4,8 МБ за 24 минуты (кольцо держит около четырёх часов), но в
        // часы пик поток доходил до 10 МБ за 2–3 минуты, и при 10 МБ на файл
        // трассировки хватало на несколько минут. 25 МБ — запас на 10–15
        // минут даже в пик.
        private const long TRACE_MAX_BYTES = 25L * 1024 * 1024;
        private string traceFilePath;
        private StreamWriter traceWriter;
        private long traceBytes;
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> traceQueue =
            new System.Collections.Concurrent.ConcurrentQueue<string>();
        /// <summary>Строки ядра первых секунд после запуска — настройки и профили — идут и в общий журнал.</summary>
        private const int CORE_STARTUP_LINES = 300;
        private const int CORE_STARTUP_SEC = 5;
        private DateTime coreOutputSinceUtc = DateTime.MinValue;
        private int coreStartupLines = 0;
        /// <summary>Ядро запущено с --debug: счётчики и трассировка есть.</summary>
        private volatile bool coreDebug = false;
        private const int ACTIVITY_SUMMARY_MIN = 10;
        private DateTime lastSummaryUtc = DateTime.MinValue;
        private long lastSummaryDesync = 0;
        /// <summary>Сайты, впервые распознанные с прошлой сводки (не больше 40 имён).</summary>
        private readonly System.Collections.Generic.List<string> hostsSinceSummary =
            new System.Collections.Generic.List<string>();
        private int hostsSinceSummaryMore = 0;

        // ---- Счётчик реальной работы обхода ------------------------------
        // Четыре карточки на главной (драйвер, профили, PID, аптайм) отвечают
        // на вопрос «процесс жив?», но не на вопрос «он что-то делает?».
        // Эти счётчики берутся из вывода ядра и отвечают именно на второй:
        // ноль десинхронизаций при работающем ядре означает, что до winws
        // просто не доходит трафик (системный прокси, VPN, пустые списки).
        private long desyncCount = 0;
        private long hostnameCount = 0;
        private readonly System.Collections.Generic.HashSet<string> seenHosts =
            new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object activityLock = new object();
        private System.Windows.Forms.Timer activityTimer;
        private long lastSentDesync = -1;
        private long lastSentHosts = -1;

        // ---- Автоподбор стратегии ----------------------------------------
        /// <summary>Идёт автоподбор: статусы ядра в интерфейс не отправляются.</summary>
        private volatile bool autotuneRunning = false;
        private volatile bool autotuneCancel = false;

        // ---- Прокси Telegram ---------------------------------------------
        /// <summary>
        /// Мост MTProto → WebSocket. К winws отношения не имеет и работает
        /// независимо: обход может быть выключен, а прокси — поднят.
        /// </summary>
        private TgProxyServer tgProxy;
        /// <summary>Отправка состояния прокси в интерфейс, пока он работает.</summary>
        private System.Windows.Forms.Timer tgStatusTimer;
        /// <summary>Текст последней ошибки запуска — показывается в интерфейсе.</summary>
        private string tgLastError = "";

        /// <summary>
        /// Порт удалённой отладки WebView2 — только для тестовых сборок и только
        /// по ключу --devtools-port=N. Нужен, чтобы проверить подбор на живой
        /// программе из скрипта, не кликая мышью. В выпусках ключ игнорируется:
        /// открытый порт отладки дал бы любой программе на машине управлять
        /// окном, запущенным от администратора.
        /// </summary>
        private static int DevToolsPort = 0;

        /// <summary>
        /// Программу запустил Планировщик при входе в Windows (ключ --autostart).
        /// Окно тогда не показывается — программа сразу уходит в трей.
        /// </summary>
        private static bool LaunchedAtLogon = false;
        /// <summary>Первый показ окна ещё впереди и его надо подавить (запуск при входе).</summary>
        private bool suppressFirstShow = false;
        private bool instanceListenerStarted = false;

        [STAThread]
        public static void Main(string[] args)
        {
            foreach (var a in args)
            {
                if (string.Equals(a, AutostartArg, StringComparison.OrdinalIgnoreCase)) LaunchedAtLogon = true;
            }

            if (LaunchedAtLogon)
            {
                // Задача создаётся с обычным приоритетом, но если её правили
                // руками — ядро унаследовало бы «ниже среднего» от нас, а
                // обработка пакетов под нагрузкой от этого заметно страдает.
                try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.Normal; } catch { }
            }

            if (AppVersion.Contains("-test"))
            {
                foreach (var a in args)
                {
                    int port;
                    if (a.StartsWith("--devtools-port=", StringComparison.Ordinal) &&
                        int.TryParse(a.Substring("--devtools-port=".Length), out port) && port > 1024 && port < 65536)
                        DevToolsPort = port;
                }
            }

            // Самым первым делом: вторая копия не должна успеть ни распаковать
            // файлы поверх работающих, ни снять чужое ядро.
            if (!AcquireSingleInstance()) return;

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
                    // Ключи запуска переживают повышение прав.
                    Arguments = string.Join(" ", Array.ConvertAll(args, a => "\"" + a.Replace("\"", "") + "\"")),
                    UseShellExecute = true,
                    Verb = "runas"
                };

                // Повышенный процесс — это новая копия; мьютекс надо отдать ему,
                // иначе он решит, что программа уже запущена, и выйдет.
                ReleaseSingleInstance();
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

        /// <summary>
        /// Завершает все процессы winws.exe в системе, включая свой
        /// собственный. Вызывается на старте, при остановке и на выходе,
        /// то есть там, где своё ядро всё равно снимается. Для кнопки
        /// «Очистить зависшие winws» нужен <see cref="KillStaleWinws"/>: он трогает
        /// только чужие экземпляры.
        /// </summary>
        /// <returns>Сколько процессов фактически завершилось.</returns>
        public static int KillZombieWinDivert()
        {
            int gone = 0;
            try
            {
                Process[] procs = Process.GetProcessesByName("winws");
                foreach (var p in procs)
                {
                    // Ждём фактического завершения: пока процесс жив, он держит
                    // мьютекс Global\winws_arg_* и следующий запуск с тем же
                    // фильтром будет отклонён ядром.
                    try { p.Kill(); p.WaitForExit(3000); } catch { }
                    try { if (p.HasExited) gone++; } catch { }
                    try { p.Dispose(); } catch { }
                }
            }
            catch { }
            return gone;
        }

        public MainForm()
        {
            // TLS 1.2 для WebClient во всём процессе. Раньше протокол выставлялся
            // только перед загрузкой обновления, и остальные запросы к GitHub
            // (список узлов для прокси Telegram) шли по TLS 1.0 и тихо падали.
            try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; } catch { }

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
                this.Icon = LoadAppIcon(false);
            }
            catch { }

            InitLogging();
            if (LaunchedAtLogon)
            {
                suppressFirstShow = true;
                WriteLogFile("info", "Setup", "Запуск при входе в Windows — окно не показываю, программа в трее.");
            }
            ExtractResources();
            SetupTray();
            this.Shown += (s, e) => StartInstanceListener();
            InitializeWebView();
            Task.Run(() => RepointAutostartTask());

            // Счётчики уходят в интерфейс раз в секунду и только при изменении,
            // иначе при --debug это был бы ещё один поток сообщений в WebView.
            activityTimer = new System.Windows.Forms.Timer();
            activityTimer.Interval = 1000;
            activityTimer.Tick += (s, e) => PushActivity();
            activityTimer.Start();

            // Смена сети меняет индекс интерфейса, а к нему привязано ядро.
            // Без этого при переходе Wi-Fi <-> кабель привязка стала бы
            // неверной и обход тихо перестал бы работать.
            try
            {
                System.Net.NetworkInformation.NetworkChange.NetworkAddressChanged += (s, e) =>
                {
                    try { SendNetRoute(); } catch { }
                };
            }
            catch { }

            this.FormClosing += MainForm_FormClosing;
        }

        /// <summary>
        /// При запуске из Планировщика окно не показывается. Первый показ
        /// делает Application.Run — его и подавляем. Описатель окна всё равно
        /// создаётся: без него не работают BeginInvoke и WebView2, а интерфейс
        /// обязан загрузиться — включать обход при запуске умеет только он.
        /// Следующий Show() — из трея или повторным запуском — показывает
        /// окно как обычно, тогда же срабатывает и центрирование.
        /// </summary>
        protected override void SetVisibleCore(bool value)
        {
            if (value && suppressFirstShow)
            {
                suppressFirstShow = false;
                if (!IsHandleCreated) CreateHandle();
                base.SetVisibleCore(false);
                // Обычно слушатель стартует по Shown, а его не будет, пока
                // окно не откроют: повторный запуск exe не показал бы окно.
                StartInstanceListener();
                return;
            }
            base.SetVisibleCore(value);
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


        /// <summary>Имя файла-маркера с версией, которая разложила bin и dist.</summary>
        private const string UnpackMarkerName = "unpacked-version.txt";

        /// <summary>
        /// Файлы, которые заняты САМОЙ ПРОГРАММОЙ и потому не удаляются.
        /// </summary>
        /// <remarks>
        /// Это не остатки прошлой версии, и считать их неудачей уборки нельзя.
        ///
        /// WebView2Loader.dll программа записывает и загружает в память в
        /// Main, до создания формы — то есть до уборки, и держит до выхода.
        /// WinDivert64.sys держит загруженный драйвер.
        ///
        /// Оба заняты ВСЕГДА, поэтому без этого списка маркер версии не
        /// записывался бы никогда, и уборка с полной перераспаковкой
        /// повторялась бы при каждом запуске.
        /// </remarks>
        private static readonly string[] PurgeKeepBusy = new string[]
        {
            "WebView2Loader.dll",
            "WinDivert64.sys"
        };

        private static bool IsBusyByUs(string fileName)
        {
            foreach (string n in PurgeKeepBusy)
                if (string.Equals(fileName, n, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        /// <summary>
        /// Сносит каталог. Возвращает true, если не осталось ничего, кроме
        /// файлов, занятых самой программой.
        /// </summary>
        /// <remarks>
        /// Если снести разом не вышло, удаляем по одному: частичная уборка
        /// лучше, чем никакой. Про настоящие неудачи сообщаем честно — по
        /// возвращённому значению решается, записывать ли маркер, а значит
        /// повторится ли попытка при следующем запуске.
        /// </remarks>
        private bool PurgeDirectory(string path)
        {
            if (!Directory.Exists(path)) return true;

            try
            {
                Directory.Delete(path, true);
                return true;
            }
            catch { }

            int failed = 0;
            try
            {
                foreach (string f in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                {
                    try { File.Delete(f); }
                    catch
                    {
                        if (IsBusyByUs(Path.GetFileName(f))) continue;
                        failed++;
                        SendLog("warn", "Не удалось удалить файл прошлой версии: " + f, "Setup");
                    }
                }
                if (failed == 0)
                {
                    // Каталог мог остаться из-за занятых файлов — это не ошибка.
                    try { Directory.Delete(path, true); } catch { }
                    return true;
                }
            }
            catch (Exception ex)
            {
                SendLog("warn", "Уборка каталога " + path + " прервана: " + ex.Message, "Setup");
                return false;
            }

            return false;
        }

        /// <summary>
        /// Удаляет файлы прошлых версий перед распаковкой.
        /// </summary>
        /// <remarks>
        /// Распаковка перезаписывает файлы по имени и не удаляет ничего. Из-за
        /// этого на диске копилось всё, что мы когда-либо поставляли: имя
        /// сборки интерфейса содержит хэш содержимого (index-D2Ys9Scj.js), и
        /// каждая версия оставляла прежнюю лежать — по полмегабайта на выпуск.
        /// Так же оставались списки, которые мы перестали поставлять
        /// (ipset-telegram.txt после 0.1.5).
        ///
        /// Но вес — не главное. Ошибки распаковки проглатываются молча, и при
        /// занятом файле получалась смесь версий: новый index.html и старые
        /// assets рядом, то есть белое окно без единого сообщения. Снос
        /// каталога целиком убирает и этот случай.
        ///
        /// Трогаются только каталоги, которые мы раскладываем сами. host-list
        /// с доменами пользователя, settings.json и журналы не трогаются.
        ///
        /// Чужие winws снимаются в Main до создания формы, поэтому к моменту
        /// уборки bin\ никем не занят.
        /// </remarks>
        private bool PurgePreviousVersion(string baseDir)
        {
            string markerPath = Path.Combine(baseDir, UnpackMarkerName);

            string unpacked = null;
            try
            {
                if (File.Exists(markerPath)) unpacked = File.ReadAllText(markerPath).Trim();
            }
            catch { }

            if (unpacked == AppVersion) return false;

            bool first = string.IsNullOrEmpty(unpacked) && !Directory.Exists(distPath);
            if (!first)
            {
                SendLog("info",
                    "Версия сменилась (" + (string.IsNullOrEmpty(unpacked) ? "неизвестно" : unpacked)
                    + " -> " + AppVersion + "), удаляю файлы прошлой версии.", "Setup");
            }

            // & вместо &&: второй каталог должен быть убран независимо от того,
            // что случилось с первым.
            return PurgeDirectory(distPath) & PurgeDirectory(binPath);
        }

        private void ExtractResources()
        {
            try
            {
                string baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI");
                distPath = Path.Combine(baseDir, "dist");
                binPath = Path.Combine(baseDir, "bin");
                listsPath = Path.Combine(baseDir, "host-list");

                bool purged = PurgePreviousVersion(baseDir);

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
                // Скачанные из репозитория списки — поверх встроенных, если новее.
                ApplyListsOverlay();

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
                // Маркер пишется только если уборка прошла без остатка. Иначе
                // версия в нём останется прежней, и при следующем запуске мы
                // попробуем убрать снова — к тому времени занятый файл,
                // скорее всего, освободится.
                if (purged)
                {
                    try { File.WriteAllText(Path.Combine(baseDir, UnpackMarkerName), AppVersion); }
                    catch (Exception ex) { SendLog("warn", "Не удалось записать маркер версии: " + ex.Message, "Setup"); }
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
                CoreWebView2Environment env;
                if (DevToolsPort > 0)
                {
                    env = await CoreWebView2Environment.CreateAsync(null, userDataFolder,
                        new CoreWebView2EnvironmentOptions("--remote-debugging-port=" + DevToolsPort));
                }
                else
                {
                    env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                }
                await webView.EnsureCoreWebView2Async(env);

                // Настройки должны оказаться на странице РАНЬШЕ её скриптов,
                // иначе интерфейс успеет прочитать пустоту и записать поверх
                // файла значения по умолчанию.
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    "window.__zapret_settings = " + LoadSettingsJson() + ";" +
                    "window.__zapret_launch = { atLogon: " + (LaunchedAtLogon ? "true" : "false") + " };");

                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.zapret",
                    distPath,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = DevToolsPort > 0;

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
            // В zapret2.log — события программы. Поток ядра идёт мимо, в
            // winws-trace.log (HandleWinwsOutput).
            WriteLogFile(level, source, message);
            SendUiLog(level, message, source);
        }

        /// <summary>Строка только в «Журнал» интерфейса, без записи в zapret2.log.</summary>
        private void SendUiLog(string level, string message, string source)
        {
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
                traceFilePath = Path.Combine(logDir, "winws-trace.log");
                OpenLogWriter();

                logThread = new Thread(LogPump);
                logThread.IsBackground = true;
                logThread.Start();

                WriteLogFile("info", "Logger", string.Format(
                    "=== Zapret2 Control Center v{0} запущен, лог: {1} (поток ядра — winws-trace.log) ===",
                    AppVersion, logFilePath));
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

        /// <summary>Строка вывода ядра — в файл трассировки. Вызывается из любых потоков.</summary>
        private void WriteTraceLine(string message)
        {
            if (traceFilePath == null) return;
            if (traceQueue.Count > LOG_QUEUE_MAX) return;
            traceQueue.Enqueue(string.Format("{0:yyyy-MM-dd HH:mm:ss.fff} {1}", DateTime.Now, message));
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

                // Пачками по 2000 строк; если в очереди осталось — сразу на
                // следующий круг, не дожидаясь сигнала.
                if (DrainLogQueue(logQueue, sb, false) | DrainLogQueue(traceQueue, sb, true))
                    try { logSignal.Set(); } catch { }
            }

            DrainLogQueue(logQueue, sb, false);
            DrainLogQueue(traceQueue, sb, true);
            try
            {
                lock (this)
                {
                    if (logWriter != null) { logWriter.Flush(); logWriter.Dispose(); logWriter = null; }
                    if (traceWriter != null) { traceWriter.Flush(); traceWriter.Dispose(); traceWriter = null; }
                }
            }
            catch { }
        }

        /// <summary>Пишет пачку строк из очереди. true — в очереди ещё остались строки.</summary>
        private bool DrainLogQueue(System.Collections.Concurrent.ConcurrentQueue<string> queue, StringBuilder sb, bool trace)
        {
            sb.Length = 0;
            int n = 0;
            string line;
            while (n < 2000 && queue.TryDequeue(out line))
            {
                sb.Append(line).Append("\r\n");
                n++;
            }
            if (n == 0) return false;

            try
            {
                lock (this)
                {
                    string chunk = sb.ToString();
                    int bytes = Encoding.UTF8.GetByteCount(chunk);
                    if (trace)
                    {
                        if (traceWriter == null) OpenTraceWriter();
                        if (traceWriter == null) return !queue.IsEmpty;
                        traceWriter.Write(chunk);
                        traceWriter.Flush();
                        traceBytes += bytes;
                        if (traceBytes >= TRACE_MAX_BYTES) RotateTrace();
                    }
                    else
                    {
                        if (logWriter == null) return !queue.IsEmpty;
                        logWriter.Write(chunk);
                        logWriter.Flush();
                        logBytes += bytes;
                        if (logBytes >= LOG_MAX_BYTES) RotateLog();
                    }
                }
            }
            catch { }
            return !queue.IsEmpty;
        }

        private void OpenTraceWriter()
        {
            try
            {
                var fs = new FileStream(traceFilePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                traceBytes = fs.Length;
                traceWriter = new StreamWriter(fs, new UTF8Encoding(false));
                traceWriter.AutoFlush = false;
            }
            catch { traceWriter = null; }
        }

        /// <summary>
        /// Кольцо из двух файлов: текущий переезжает в winws-trace.1.log,
        /// прежний .1 удаляется. Без zip: трассировка нужна на последние
        /// часы, а упаковка в пик нагрузки каждые несколько минут — лишняя
        /// работа процессора.
        /// </summary>
        private void RotateTrace()
        {
            try
            {
                traceWriter.Flush();
                traceWriter.Dispose();
                traceWriter = null;
                string old = Path.Combine(logDir, "winws-trace.1.log");
                if (File.Exists(old)) File.Delete(old);
                File.Move(traceFilePath, old);
            }
            catch { }
            finally
            {
                OpenTraceWriter();
            }
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


        // =================================================================
        //  Настройки приложения
        //
        //  Хранилище браузера пишет на диск с задержкой: изменения копятся в
        //  памяти и сбрасываются пачкой через несколько секунд простоя либо
        //  при аккуратном закрытии движка. Приложение закрывалось через
        //  Application.Exit(), не дав WebView2 закрыться, и процесс браузера
        //  убивался вместе с нашим — всё, что пользователь поменял за
        //  секунды до выхода, пропадало. Выглядело это как «пресет не
        //  запоминается».
        //
        //  Поэтому настройки живут в обычном файле, который пишется
        //  синхронно, сразу при изменении. Страница получает его содержимое
        //  ДО загрузки, так что гонки «что прочитается раньше» нет.
        // =================================================================

        /// <summary>Путь к settings.json рядом с каталогом логов.</summary>
        private string SettingsFilePath()
        {
            string root = Path.GetDirectoryName(logDir); // %LOCALAPPDATA%\Zapret2-GUI
            if (string.IsNullOrEmpty(root))
                root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI");
            return Path.Combine(root, "settings.json");
        }

        /// <summary>
        /// Читает настройки. Всегда возвращает корректное выражение JavaScript:
        /// при любой беде — пустой объект, чтобы страница не падала на разборе.
        /// </summary>
        private string LoadSettingsJson()
        {
            try
            {
                string path = SettingsFilePath();
                if (!File.Exists(path)) return "{}";

                string text = File.ReadAllText(path, Encoding.UTF8).Trim();
                if (text.Length == 0 || text[0] != '{') return "{}";

                // Завершающий ноль и прочий мусор ломают JSON.parse, а файл мы
                // пишем сами — значит испортить его мог только сбой записи.
                if (text.IndexOf('\0') >= 0) return "{}";
                return text;
            }
            catch (Exception ex)
            {
                SendLog("warn", "Не удалось прочитать settings.json: " + ex.Message, "Settings");
                return "{}";
            }
        }

        /// <summary>
        /// Записывает настройки. Сначала во временный файл, затем подменой —
        /// иначе сбой посреди записи оставил бы обрезанный файл и человек
        /// потерял бы все настройки сразу, а не последнее изменение.
        /// </summary>
        private void SaveSettingsJson(string json)
        {
            if (string.IsNullOrEmpty(json)) return;
            try
            {
                string path = SettingsFilePath();
                string dir = Path.GetDirectoryName(path);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                string tmp = path + ".tmp";
                File.WriteAllText(tmp, json, new UTF8Encoding(false));

                if (File.Exists(path)) File.Replace(tmp, path, null);
                else File.Move(tmp, path);
            }
            catch (Exception ex)
            {
                SendLog("warn", "Не удалось сохранить settings.json: " + ex.Message, "Settings");
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


        // =================================================================
        //  Кэш Discord
        //
        //  Обход рвёт соединения посреди загрузки, Discord складывает в кэш
        //  обрезанные ответы и продолжает показывать поломку уже после того,
        //  как сеть починили. Отсюда кнопка «очистить».
        //
        //  Операция необратимая, поэтому правила жёсткие:
        //
        //  1. Удаляем строго по БЕЛОМУ списку каталогов. Заведёт Discord новую
        //     папку — мы её не тронем. Обратный подход (чёрный список) рано или
        //     поздно снесёт что-нибудь ценное.
        //  2. Local Storage не трогаем НИКОГДА: там токен, удаление
        //     разлогинивает. Ради экономии 20 МБ это плохая сделка.
        //  3. %LOCALAPPDATA%\Discord (сам клиент, Squirrel, модули) не трогаем
        //     вовсе: цена ошибки — переустановка с нуля.
        //  4. Пока процесс жив, файлы заблокированы. Закрываем только по явной
        //     команде пользователя, не молча.
        //  5. Каждый удалённый путь пишется в журнал.
        // =================================================================

        /// <summary>Каталоги, которые можно удалять. Только точные имена и Dawn*Cache.</summary>
        private static readonly string[] DiscordCacheDirs = new string[]
        {
            "Cache", "Code Cache", "GPUCache", "Service Worker", "logs"
        };

        /// <summary>Сборки Discord: имя каталога в %APPDATA% и имя процесса.</summary>
        private static readonly string[][] DiscordFlavors = new string[][]
        {
            new string[] { "discord",            "Discord",            "Discord" },
            new string[] { "discordptb",         "DiscordPTB",         "Discord PTB" },
            new string[] { "discordcanary",      "DiscordCanary",      "Discord Canary" },
            new string[] { "discorddevelopment", "DiscordDevelopment", "Discord Development" }
        };

        private static bool IsDiscordCacheDir(string name)
        {
            foreach (string d in DiscordCacheDirs)
            {
                if (string.Equals(name, d, StringComparison.OrdinalIgnoreCase)) return true;
            }
            // DawnCache, DawnGraphiteCache, DawnWebGPUCache — имена меняются от
            // версии к версии, поэтому здесь шаблон, а не список.
            return name.StartsWith("Dawn", StringComparison.OrdinalIgnoreCase)
                && name.EndsWith("Cache", StringComparison.OrdinalIgnoreCase);
        }

        private static long DirectorySize(string path)
        {
            long total = 0;
            try
            {
                foreach (string f in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                {
                    try { total += new FileInfo(f).Length; } catch { }
                }
            }
            catch { }
            return total;
        }

        /// <summary>Считает размер кэша каждой найденной сборки Discord и отдаёт в интерфейс.</summary>
        private void SendDiscordScan()
        {
            var sb = new StringBuilder();
            sb.Append("{\"type\":\"discord_scan\",\"items\":[");

            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            bool first = true;

            foreach (string[] flavor in DiscordFlavors)
            {
                string dir = Path.Combine(appData, flavor[0]);
                if (!Directory.Exists(dir)) continue;

                long size = 0;
                int dirs = 0;
                try
                {
                    foreach (string sub in Directory.GetDirectories(dir))
                    {
                        if (!IsDiscordCacheDir(Path.GetFileName(sub))) continue;
                        size += DirectorySize(sub);
                        dirs++;
                    }
                }
                catch { }

                bool running = false;
                try { running = Process.GetProcessesByName(flavor[1]).Length > 0; }
                catch { }

                if (!first) sb.Append(",");
                first = false;
                sb.AppendFormat(
                    "{{\"id\":\"{0}\",\"name\":\"{1}\",\"sizeBytes\":{2},\"dirs\":{3},\"running\":{4}}}",
                    JsonEscape(flavor[0]), JsonEscape(flavor[2]), size, dirs,
                    running ? "true" : "false");
            }

            sb.Append("]}");
            SendToWeb(sb.ToString());
        }

        /// <summary>
        /// Закрывает указанные сборки Discord и чистит их кэш.
        /// </summary>
        /// <param name="payload">
        /// Идентификаторы каталогов через запятую и флаг закрытия:
        /// <c>discord,discordptb|close</c>.
        /// </param>
        private void CleanDiscordCache(string payload)
        {
            string[] parts = payload.Split('|');
            string[] ids = parts[0].Split(',');
            bool closeFirst = parts.Length > 1 && parts[1] == "close";

            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            long freed = 0;
            int removed = 0;
            var failed = new System.Collections.Generic.List<string>();

            foreach (string rawId in ids)
            {
                string id = rawId.Trim();
                string[] flavor = null;
                foreach (string[] f in DiscordFlavors)
                {
                    if (string.Equals(f[0], id, StringComparison.OrdinalIgnoreCase)) { flavor = f; break; }
                }
                // Идентификатор пришёл из веб-слоя: сверяем со своим списком,
                // чтобы «id» не превратился в произвольный путь.
                if (flavor == null) continue;

                if (closeFirst)
                {
                    try
                    {
                        Process[] procs = Process.GetProcessesByName(flavor[1]);
                        if (procs.Length > 0)
                        {
                            SendLog("info", flavor[2] + ": закрываю, процессов — " + procs.Length + ".", "Discord");
                            foreach (Process p in procs)
                            {
                                try { p.Kill(); } catch { }
                            }
                            foreach (Process p in procs)
                            {
                                // Файлы освобождаются не мгновенно после Kill.
                                try { p.WaitForExit(5000); } catch { }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        SendLog("warn", flavor[2] + ": не удалось закрыть — " + ex.Message, "Discord");
                    }
                }

                string dir = Path.Combine(appData, flavor[0]);
                if (!Directory.Exists(dir)) continue;

                foreach (string sub in Directory.GetDirectories(dir))
                {
                    string name = Path.GetFileName(sub);
                    if (!IsDiscordCacheDir(name)) continue;

                    long size = DirectorySize(sub);
                    try
                    {
                        Directory.Delete(sub, true);
                        freed += size;
                        removed++;
                        SendLog("info", "Удалено: " + sub + " (" + FormatSize(size) + ")", "Discord");
                    }
                    catch (Exception ex)
                    {
                        failed.Add(name);
                        SendLog("warn", "Не удалось удалить " + sub + ": " + ex.Message, "Discord");
                    }
                }
            }

            if (failed.Count > 0)
            {
                SendLog("warn",
                    "Часть каталогов занята и осталась на месте (" + string.Join(", ", failed.ToArray())
                    + "). Обычно это значит, что Discord ещё не закрылся.", "Discord");
            }

            SendLog(removed > 0 ? "success" : "info",
                removed > 0
                    ? "Кэш Discord очищен: каталогов — " + removed + ", освобождено " + FormatSize(freed) + "."
                    : "Удалять нечего: кэш уже пуст.",
                "Discord");

            SendToWeb(string.Format(
                "{{\"type\":\"discord_clean_done\",\"freedBytes\":{0},\"removed\":{1},\"failed\":{2}}}",
                freed, removed, failed.Count));

            SendDiscordScan();
        }

        private static string FormatSize(long bytes)
        {
            if (bytes >= 1073741824L) return (bytes / 1073741824.0).ToString("0.0") + " ГБ";
            if (bytes >= 1048576L) return (bytes / 1048576.0).ToString("0") + " МБ";
            if (bytes >= 1024L) return (bytes / 1024.0).ToString("0") + " КБ";
            return bytes + " Б";
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
            SendStatus(status, pid, "");
        }

        /// <param name="extra">Дополнительные поля JSON, начиная с запятой.</param>
        private void SendStatus(string status, int pid, string extra)
        {
            // Во время автоподбора ядро перезапускается по разу на вариант.
            // Если пропускать эти статусы в интерфейс, кнопка питания будет
            // семь раз мигать «подключение → работает → остановлено».
            if (autotuneRunning) return;
            SendToWeb(string.Format("{{\"type\":\"status_change\",\"status\":\"{0}\",\"pid\":{1}{2}}}", status, pid, extra));
            UpdateTrayForStatus(status);
        }

        /// <summary>
        /// Подсказка значка в трее — состояние обхода словами. Если окно
        /// спрятано, об ошибке говорит всплывающее сообщение: иначе кнопка
        /// покраснеет там, где её никто не видит, — например, после запуска
        /// при входе в Windows или падения ядра посреди игры.
        /// </summary>
        private void UpdateTrayForStatus(string status)
        {
            if (!IsHandleCreated) return;
            try
            {
                BeginInvoke(new Action(() =>
                {
                    if (trayIcon == null || isExiting) return;
                    try
                    {
                        trayIcon.Text = status == "connected" ? "Zapret2 — обход включён"
                            : status == "restarting" ? "Zapret2 — ядро упало, перезапуск…"
                            : status == "error" ? "Zapret2 — обход не работает"
                            : "Zapret2 — обход выключен";
                        if (status == "error" && !this.Visible)
                        {
                            trayIcon.ShowBalloonTip(5000, "Обход не работает",
                                "Ядро не запустилось или упало. Откройте Zapret2 — подробности в журнале.",
                                ToolTipIcon.Warning);
                        }
                    }
                    catch { }
                }));
            }
            catch { }
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

        // =================================================================
        //  Предполётная проверка окружения
        //
        //  Отвечает на вопрос «почему обход может ничего не сделать».
        //  Все четыре проверки взяты из реальных случаев, каждый из которых
        //  стоил круга диагностики по пустому логу.
        // =================================================================

        private static string JsonEscape(string s)
        {
            if (s == null) return string.Empty;
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"")
                    .Replace("\r", " ").Replace("\n", " ");
        }

        private class PreflightItem
        {
            public string Id;
            /// <summary>ok | warn | error</summary>
            public string Level;
            public string Title;
            public string Detail;
            /// <summary>Команда кнопки в интерфейсе (сообщение нативной части) и её подпись.</summary>
            public string Action;
            public string ActionLabel;
        }

        /// <summary>
        /// Включены ли в Windows метки времени TCP (RFC 1323). null — не удалось понять.
        /// </summary>
        /// <remarks>
        /// От них зависит fooling=ts: ядро портит в фейке поле TSval, и сервер
        /// его отбрасывает. Если система меток не ставит, портить нечего —
        /// фейк доходит до сервера и ломает соединение. Flowseal включает
        /// метки при каждом запуске; мы спрашиваем.
        /// </remarks>
        private static bool? TcpTimestampsEnabled()
        {
            try
            {
                var psi = new ProcessStartInfo("netsh", "interface tcp show global")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    StandardOutputEncoding = Encoding.GetEncoding(System.Globalization.CultureInfo.CurrentCulture.TextInfo.OEMCodePage)
                };
                using (var p = Process.Start(psi))
                {
                    string text = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(5000);
                    foreach (var raw in text.Split('\n'))
                    {
                        if (raw.IndexOf("1323", StringComparison.Ordinal) < 0) continue;
                        int colon = raw.LastIndexOf(':');
                        if (colon < 0) continue;
                        string v = raw.Substring(colon + 1).Trim().ToLowerInvariant();
                        if (v.StartsWith("enabled") || v.StartsWith("включ") || v.StartsWith("разреш")) return true;
                        if (v.StartsWith("disabled") || v.StartsWith("отключ") || v.StartsWith("выключ") || v.StartsWith("запрещ")) return false;
                    }
                }
            }
            catch { }
            return null;
        }

        private void EnableTcpTimestamps()
        {
            try
            {
                var psi = new ProcessStartInfo("netsh", "interface tcp set global timestamps=enabled")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (var p = Process.Start(psi))
                {
                    p.StandardOutput.ReadToEnd();
                    p.WaitForExit(5000);
                }
                bool? now = TcpTimestampsEnabled();
                SendLog(now == true ? "success" : "error",
                    now == true ? "Метки времени TCP включены." : "Не удалось включить метки времени TCP.", "Preflight");
            }
            catch (Exception ex)
            {
                SendLog("error", "Не удалось включить метки времени TCP: " + ex.Message, "Preflight");
            }
            SendPreflight();
        }

        /// <summary>
        /// Соединения Discord, которые ведут на системный прокси. Пустой список —
        /// Discord не запущен или ходит напрямую.
        /// </summary>
        /// <remarks>
        /// Случай 2026-10-12: Happ (xray) держал системный прокси 127.0.0.1:10809,
        /// и все TCP-соединения Discord.exe шли в него. Обход их не видел —
        /// фильтр WinDivert исключает loopback, — а человек менял стратегии и
        /// не понимал, почему Discord то открывается, то нет.
        /// </remarks>
        private static int CountDiscordProxyConnections(string proxyAddr)
        {
            string hostPort = proxyAddr;
            // Формат «http=127.0.0.1:10809;https=...» — берём первый адрес.
            int semi = hostPort.IndexOf(';');
            if (semi > 0) hostPort = hostPort.Substring(0, semi);
            int eq = hostPort.IndexOf('=');
            if (eq >= 0) hostPort = hostPort.Substring(eq + 1);
            hostPort = hostPort.Replace("http://", "").Trim().TrimEnd('/');
            if (hostPort.StartsWith("localhost:", StringComparison.OrdinalIgnoreCase))
                hostPort = "127.0.0.1:" + hostPort.Substring("localhost:".Length);
            if (hostPort.Length == 0) return 0;

            var pids = new System.Collections.Generic.HashSet<string>();
            foreach (var name in new[] { "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment" })
            {
                foreach (var p in Process.GetProcessesByName(name))
                {
                    pids.Add(p.Id.ToString());
                    p.Dispose();
                }
            }
            if (pids.Count == 0) return 0;

            int found = 0;
            try
            {
                var psi = new ProcessStartInfo("netstat", "-ano -p TCP")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true
                };
                using (var p = Process.Start(psi))
                {
                    string text = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(5000);
                    foreach (var raw in text.Split('\n'))
                    {
                        var cols = raw.Split(new[] { ' ', '\t', '\r' }, StringSplitOptions.RemoveEmptyEntries);
                        // TCP  локальный  удалённый  состояние  PID
                        if (cols.Length < 5 || cols[0] != "TCP") continue;
                        if (cols[2] == hostPort && pids.Contains(cols[4])) found++;
                    }
                }
            }
            catch { }
            return found;
        }

        /// <summary>Читает системный прокси Windows. null, если он выключен.</summary>
        private string GetSystemProxy()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Internet Settings"))
                {
                    if (key == null) return null;
                    object enabled = key.GetValue("ProxyEnable");
                    if (enabled == null || Convert.ToInt32(enabled) == 0) return null;
                    string addr = key.GetValue("ProxyServer") as string;
                    return string.IsNullOrEmpty(addr) ? null : addr;
                }
            }
            catch { return null; }
        }

        private System.Collections.Generic.List<PreflightItem> CollectPreflight()
        {
            var list = new System.Collections.Generic.List<PreflightItem>();

            // 1. Системный прокси. Трафик уходит на 127.0.0.1, а фильтр
            //    WinDivert начинается с "!loopback" — winws его не видит.
            string proxy = GetSystemProxy();
            if (proxy != null)
            {
                list.Add(new PreflightItem
                {
                    Id = "proxy",
                    Level = "warn",
                    Title = "Включён системный прокси: " + proxy,
                    Detail = "HTTP(S) приложений уходит на прокси через loopback, " +
                             "обход такой трафик не видит. Discord и браузеры берут этот прокси " +
                             "сами. UDP (голос Discord, QUIC) идёт мимо прокси и обрабатывается."
                });

                int viaProxy = CountDiscordProxyConnections(proxy);
                if (viaProxy > 0)
                {
                    list.Add(new PreflightItem
                    {
                        Id = "discord_proxy",
                        Level = "error",
                        Title = "Discord ходит через прокси, а не через обход",
                        Detail = "Соединений Discord с прокси " + proxy + ": " + viaProxy + ". Загрузка, сообщения и " +
                                 "картинки идут через него, и никакая стратегия на них не влияет. Выключите VPN-клиент " +
                                 "(или добавьте Discord в его исключения) и перезапустите Discord полностью — через значок в трее."
                    });
                }
            }
            else
            {
                list.Add(new PreflightItem
                {
                    Id = "proxy",
                    Level = "ok",
                    Title = "Системный прокси выключен",
                    Detail = "Трафик идёт напрямую — обход может его обработать."
                });
            }

            // 2. Виртуальные адаптеры VPN. Сами по себе не ломают обход, но
            //    меняют маршрут, и трафик может уходить мимо DPI провайдера.
            try
            {
                // Раньше здесь просто перечислялись поднятые туннельные
                // адаптеры со словами «если через них уходит весь трафик...».
                // Это перекладывало на человека вопрос, на который может
                // ответить система: маршрут до публичного адреса известен
                // точно. Поднятый, но простаивающий туннель обходу не мешает,
                // и пугать им незачем.
                var egress = DescribeEgress();

                if (egress.IsTunnel)
                {
                    list.Add(new PreflightItem
                    {
                        Id = "vpn",
                        Level = "warn",
                        Title = "Трафик уходит через туннель «" + egress.Name + "»",
                        Detail = "Это VPN или прокси-туннель. Он забирает весь трафик до того, " +
                                 "как тот попадёт к провайдеру, поэтому обходить нечего: " +
                                 "DPI провайдера такие пакеты не видит. Ядро обхода привязано к " +
                                 (string.IsNullOrEmpty(egress.PhysName) ? "физической карте" : "карте «" + egress.PhysName + "»") +
                                 " и внутрь туннеля не лезет. Чтобы обход заработал, выключите " +
                                 "туннель либо настройте в нём раздельную маршрутизацию."
                    });
                }
                else if (egress.PhysIfIdx == 0)
                {
                    list.Add(new PreflightItem
                    {
                        Id = "vpn",
                        Level = "warn",
                        Title = "Не удалось определить сетевую карту",
                        Detail = "Ядро будет перехватывать пакеты на всех интерфейсах сразу. " +
                                 "Если поднят VPN, обход может тронуть его трафик."
                    });
                }
            }
            catch { }

            // 2б. Метки времени TCP — без них не работают варианты с fooling=ts.
            bool? ts = TcpTimestampsEnabled();
            if (ts == false)
            {
                list.Add(new PreflightItem
                {
                    Id = "tcpts",
                    Level = "warn",
                    Title = "Метки времени TCP выключены",
                    Detail = "Часть способов обхода (с пометкой ts) без них не работает: подбор их отбросит. " +
                             "Кнопка выполнит «netsh interface tcp set global timestamps=enabled» — это настройка " +
                             "Windows, перезагрузка не нужна.",
                    Action = "enable_tcp_timestamps",
                    ActionLabel = "Включить"
                });
            }
            else if (ts == true)
            {
                list.Add(new PreflightItem
                {
                    Id = "tcpts",
                    Level = "ok",
                    Title = "Метки времени TCP включены",
                    Detail = "Способы обхода с пометкой ts будут работать."
                });
            }

            // 3. Чужие экземпляры winws. Два процесса на одном драйвере дерутся
            //    за пакеты, и результат становится непредсказуемым.
            try
            {
                int mine = 0;
                lock (procLock) { if (winws != null && !winws.HasExited) mine = winws.Id; }

                var alien = new System.Collections.Generic.List<int>();
                foreach (var p in Process.GetProcessesByName("winws"))
                {
                    if (p.Id != mine) alien.Add(p.Id);
                    p.Dispose();
                }
                if (alien.Count > 0)
                {
                    list.Add(new PreflightItem
                    {
                        Id = "winws",
                        Level = "error",
                        Title = "Найдены посторонние winws.exe: PID " + string.Join(", ", alien.ConvertAll(x => x.ToString()).ToArray()),
                        Detail = "Два экземпляра ядра на одном драйвере WinDivert мешают " +
                                 "друг другу. Закройте лишние: Настройки → Очистить зависшие winws."
                    });
                }
            }
            catch { }

            // 4. Другие обходчики DPI. Они держат тот же драйвер.
            try
            {
                var rivals = new System.Collections.Generic.List<string>();
                foreach (var n in RivalBypassNames)
                {
                    foreach (var p in Process.GetProcessesByName(n))
                    {
                        if (!rivals.Contains(p.ProcessName)) rivals.Add(p.ProcessName);
                        p.Dispose();
                    }
                }
                if (rivals.Count > 0)
                {
                    list.Add(new PreflightItem
                    {
                        Id = "rivals",
                        Level = "error",
                        Title = "Запущен другой обходчик DPI: " + string.Join(", ", rivals.ToArray()),
                        Detail = "Он занимает драйвер WinDivert. Одновременная работа двух " +
                                 "обходчиков приводит к разрыву соединений."
                    });
                }
            }
            catch { }

            return list;
        }

        private void SendPreflight()
        {
            // Проверка запускает netsh и netstat — полсекунды, которые не
            // должны подвешивать окно.
            Task.Run(() => SendPreflightNow());
        }

        private void SendPreflightNow()
        {
            // Интерфейс нужен интерфейсу приложения до запуска ядра: он
            // подставляет --wf-iface в командную строку, и показанная команда
            // должна совпадать с той, что выполнится.
            SendNetRoute();

            try
            {
                var items = CollectPreflight();
                var sb = new StringBuilder();
                sb.Append("{\"type\":\"preflight\",\"items\":[");
                for (int i = 0; i < items.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.AppendFormat("{{\"id\":\"{0}\",\"level\":\"{1}\",\"title\":\"{2}\",\"detail\":\"{3}\",\"action\":\"{4}\",\"actionLabel\":\"{5}\"}}",
                        items[i].Id, items[i].Level,
                        JsonEscape(items[i].Title), JsonEscape(items[i].Detail),
                        JsonEscape(items[i].Action), JsonEscape(items[i].ActionLabel));
                }
                sb.Append("]}");
                SendToWeb(sb.ToString());
            }
            catch (Exception ex)
            {
                SendLog("error", "Проверка окружения не удалась: " + ex.Message, "Preflight");
            }
        }

        /// <summary>
        /// Находит и завершает посторонние процессы winws.exe — те, которые
        /// приложение не запускало, — и отчитывается о результате числами.
        /// </summary>
        /// <remarks>
        /// Свой процесс ядра исключается по PID: он снимается кнопкой питания,
        /// а не этой очисткой. Смысл именно в чужих экземплярах: два процесса
        /// на одном драйвере WinDivert дерутся за пакеты — это же ловит пункт
        /// «Найдены посторонние winws.exe» в <see cref="CollectPreflight"/>.
        ///
        /// «Найдено» и «завершено» возвращаются отдельно, потому что процесс
        /// может и не сняться, и это обязано быть видно. Раньше интерфейс
        /// отправлял сюда stop_engine (то есть останавливал СВОЁ ядро) и через
        /// 800 мс печатал «все зависшие процессы очищены (taskkill выполнено)»,
        /// не проверив ничего и назвав команду, которой не было.
        ///
        /// Итоговую строку в журнал пишет интерфейс — по полям этого ответа.
        /// Подробности по каждому PID уходят только в файл через WriteLogFile:
        /// в журнале нужна одна строка, а разбор «почему не снялся» делается
        /// по zapret2.log.
        /// </remarks>
        private void KillStaleWinws()
        {
            int mine = 0;
            try
            {
                lock (procLock) { if (winws != null && !winws.HasExited) mine = winws.Id; }
            }
            catch { }

            Process[] procs;
            try
            {
                procs = Process.GetProcessesByName("winws");
            }
            catch (Exception ex)
            {
                SendLog("error", "Не удалось получить список процессов winws.exe: " + ex.Message, "Watchdog");
                SendToWeb(string.Format(
                    "{{\"type\":\"stale_winws_done\",\"found\":0,\"killed\":0,\"failed\":0," +
                    "\"pids\":[],\"killedPids\":[],\"ownPid\":{0},\"error\":\"{1}\"}}",
                    mine, JsonEscape(ex.Message)));
                return;
            }

            var found = new System.Collections.Generic.List<int>();
            var killed = new System.Collections.Generic.List<int>();
            int failed = 0;

            foreach (Process p in procs)
            {
                int pid = 0;
                try { pid = p.Id; } catch { }

                if (pid == 0 || pid == mine)
                {
                    try { p.Dispose(); } catch { }
                    continue;
                }

                found.Add(pid);

                string reason = null;
                try
                {
                    p.Kill();
                    // Ждём фактического завершения: пока процесс жив, он держит
                    // мьютекс Global\winws_arg_* и мешает следующему запуску.
                    p.WaitForExit(3000);
                }
                catch (Exception ex)
                {
                    // Процесс мог закончиться сам между перечислением и Kill —
                    // это не ошибка. Судим по HasExited, а не по исключению.
                    reason = ex.Message;
                }

                bool exited;
                try { exited = p.HasExited; } catch { exited = false; }

                if (exited)
                {
                    killed.Add(pid);
                    WriteLogFile("info", "Watchdog", "Посторонний winws.exe PID " + pid + " завершён.");
                }
                else
                {
                    failed++;
                    WriteLogFile("warn", "Watchdog", "Посторонний winws.exe PID " + pid
                        + " не завершился" + (reason != null ? ": " + reason : " за 3 с") + ".");
                }

                try { p.Dispose(); } catch { }
            }

            SendToWeb(string.Format(
                "{{\"type\":\"stale_winws_done\",\"found\":{0},\"killed\":{1},\"failed\":{2}," +
                "\"pids\":[{3}],\"killedPids\":[{4}],\"ownPid\":{5},\"error\":\"\"}}",
                found.Count, killed.Count, failed,
                string.Join(",", found.ConvertAll(x => x.ToString()).ToArray()),
                string.Join(",", killed.ConvertAll(x => x.ToString()).ToArray()),
                mine));

            // Проверка окружения показывает тот же список: без обновления пункт
            // «Найдены посторонние winws.exe» продолжал бы висеть после очистки.
            SendPreflight();
        }

        // =================================================================
        //  Обновление самого приложения из GitHub Releases
        //
        //  Запущенный exe нельзя перезаписать, поэтому последовательность
        //  такая: скачать рядом -> сверить SHA-256 -> запустить .cmd, который
        //  дождётся выхода процесса по PID, подменит файл и стартует новую
        //  версию. Приложение помечено requireAdministrator, порождённый
        //  процесс наследует повышение прав.
        // =================================================================

        private void SendUpdateProgress(int percent, string step)
        {
            SendToWeb(string.Format(
                "{{\"type\":\"update_progress\",\"percent\":{0},\"step\":\"{1}\"}}",
                percent, JsonEscape(step)));
        }

        private void SendUpdateError(string message)
        {
            SendLog("error", message, "Updater");
            SendToWeb(string.Format(
                "{{\"type\":\"update_error\",\"message\":\"{0}\"}}", JsonEscape(message)));
        }

        /// <summary>
        /// Ссылка должна вести на GitHub. Проверка нужна не от GitHub, а от
        /// самих себя: адрес приходит из интерфейса, и без неё подменённая
        /// страница могла бы заставить скачать и запустить чужой exe.
        /// </summary>
        private static bool IsTrustedUpdateUrl(string url)
        {
            try
            {
                var u = new Uri(url);
                if (u.Scheme != "https") return false;
                string h = u.Host.ToLowerInvariant();
                return h == "github.com" || h.EndsWith(".github.com")
                    || h == "githubusercontent.com" || h.EndsWith(".githubusercontent.com");
            }
            catch { return false; }
        }

        private static string Sha256OfFile(string path)
        {
            using (var sha = System.Security.Cryptography.SHA256.Create())
            using (var fs = File.OpenRead(path))
            {
                byte[] hash = sha.ComputeHash(fs);
                var sb = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>
        /// Скачивает SHA256SUMS.txt и достаёт из него сумму нужного файла.
        /// </summary>
        /// <remarks>
        /// Качать этот файл обязана нативная часть, а не интерфейс. Страница
        /// живёт на https://app.zapret, ассеты релиза раздаются с другого хоста,
        /// и тот не отдаёт заголовки CORS: fetch из веб-слоя падает с
        /// «TypeError: Failed to fetch». api.github.com заголовки отдаёт,
        /// поэтому список ассетов приходит нормально — и выглядело это так,
        /// будто файла сумм в релизе нет. Установка из приложения из-за этого
        /// не работала ни разу, с самого 0.1.2.
        ///
        /// WebClient никакого CORS не знает: это обычный HTTP-клиент.
        /// </remarks>
        /// <returns>64 hex-символа в нижнем регистре или пустая строка.</returns>
        private string FetchSha256FromSums(string sumsUrl, string fileName)
        {
            try
            {
                try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; }
                catch { }

                string text;
                using (var wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "Zapret2-GUI/" + AppVersion);
                    text = wc.DownloadString(sumsUrl);
                }

                foreach (string raw in text.Split('\n'))
                {
                    string line = raw.Trim();
                    if (line.Length == 0) continue;
                    // Строка формата "<sha256>  <имя файла>". Имя сверяем, потому
                    // что в файле сумм может оказаться несколько строк.
                    if (line.IndexOf(fileName, StringComparison.OrdinalIgnoreCase) < 0) continue;

                    var m = Regex.Match(line, @"\b[a-fA-F0-9]{64}\b");
                    if (m.Success) return m.Value.ToLowerInvariant();
                }

                SendLog("warn", "В файле сумм нет строки для " + fileName + ".", "Updater");
            }
            catch (Exception ex)
            {
                SendLog("warn", "Не удалось скачать файл контрольных сумм: " + ex.Message, "Updater");
            }
            return string.Empty;
        }

        private void DownloadAndApplyUpdate(string payload)
        {
            // payload: <url>|<sha256 или ссылка на SHA256SUMS.txt>|<version>
            string[] parts = (payload ?? string.Empty).Split(new[] { '|' }, 3);
            if (parts.Length < 3)
            {
                SendUpdateError("Некорректные данные обновления.");
                return;
            }

            string url = parts[0].Trim();
            string shaOrSums = parts[1].Trim();
            string version = parts[2].Trim();

            if (!IsTrustedUpdateUrl(url))
            {
                SendUpdateError("Ссылка на обновление ведёт не на GitHub — загрузка отменена: " + url);
                return;
            }

            // Ссылку на файл сумм проверяем тем же правилом: она приходит из
            // веб-слоя и ведёт в сеть ровно так же, как ссылка на сборку.
            string expectedSha;
            if (shaOrSums.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                if (!IsTrustedUpdateUrl(shaOrSums))
                {
                    SendUpdateError("Ссылка на файл контрольных сумм ведёт не на GitHub — загрузка отменена.");
                    return;
                }
                expectedSha = FetchSha256FromSums(shaOrSums, Path.GetFileName(new Uri(url).LocalPath));
            }
            else
            {
                expectedSha = shaOrSums.ToLowerInvariant();
            }

            if (expectedSha.Length != 64)
            {
                // Раньше эта проверка стояла после загрузки: файл качался
                // целиком и только потом выяснялось, что сверять не с чем.
                SendUpdateError(
                    "Не удалось получить контрольную сумму сборки — установка отменена. " +
                    "Скачайте сборку вручную со страницы релиза и сверьте сумму сами.");
                return;
            }

            Task.Run(() =>
            {
                string dir = null;
                string tmp = null;
                try
                {
                    string root = Path.GetDirectoryName(logDir); // %LOCALAPPDATA%\Zapret2-GUI
                    dir = Path.Combine(root, "update");
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                    tmp = Path.Combine(dir, "Zapret2-GUI-v" + version + "-portable.exe");
                    if (File.Exists(tmp)) File.Delete(tmp);

                    SendUpdateProgress(0, "Загрузка " + version + "...");
                    SendLog("info", "Загрузка обновления: " + url, "Updater");

                    // GitHub требует TLS 1.2; в .NET 4.0 он по умолчанию выключен.
                    try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; }
                    catch { }

                    // WebClient по умолчанию использует системный прокси —
                    // это здесь правильно: у пользователя интернет идёт через него.
                    using (var wc = new WebClient())
                    {
                        wc.Headers.Add("User-Agent", "Zapret2-GUI/" + AppVersion);
                        var done = new ManualResetEvent(false);
                        Exception failure = null;

                        wc.DownloadProgressChanged += (s, e) =>
                        {
                            // 0-90% отдаём загрузке, остальное проверке и подмене.
                            SendUpdateProgress(
                                (int)(e.ProgressPercentage * 0.9),
                                string.Format("Загрузка: {0:N1} из {1:N1} МБ",
                                    e.BytesReceived / 1048576.0, e.TotalBytesToReceive / 1048576.0));
                        };
                        wc.DownloadFileCompleted += (s, e) =>
                        {
                            failure = e.Error;
                            done.Set();
                        };

                        wc.DownloadFileAsync(new Uri(url), tmp);
                        done.WaitOne();
                        if (failure != null) throw failure;
                    }

                    if (!File.Exists(tmp) || new FileInfo(tmp).Length < 100000)
                    {
                        SendUpdateError("Загруженный файл слишком мал — похоже, это не сборка.");
                        return;
                    }

                    SendUpdateProgress(92, "Проверка контрольной суммы...");

                    // Антивирус может забрать скачанный файл прямо здесь.
                    // Сборка неподписанная, распаковывает из ресурсов драйвер
                    // и запускает его от администратора — под эвристику
                    // Defender (Wacatac.H!ml и подобные) она подходит хорошо.
                    // Без отдельной проверки человек увидел бы невнятную
                    // ошибку доступа к файлу и не понял бы, при чём тут он.
                    string actual;
                    try
                    {
                        actual = Sha256OfFile(tmp);
                    }
                    catch (Exception hashEx)
                    {
                        int hr = Marshal.GetHRForException(hashEx);
                        bool virusVerdict = hr == unchecked((int)0x800700E1)   // ERROR_VIRUS_INFECTED
                                         || hr == unchecked((int)0x800700E2)   // ERROR_VIRUS_DELETED
                                         || !File.Exists(tmp);
                        if (virusVerdict)
                        {
                            SendUpdateError(
                                "Скачанную сборку заблокировал антивирус, установка отменена. " +
                                "Это ложное срабатывание эвристики: приложение не подписано и " +
                                "запускает драйвер WinDivert от администратора. Скачайте сборку " +
                                "вручную со страницы релиза и при необходимости добавьте её в " +
                                "исключения антивируса.");
                        }
                        else
                        {
                            SendUpdateError("Не удалось прочитать скачанный файл: " + hashEx.Message);
                        }
                        try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                        return;
                    }

                    // Сумма получена до загрузки, иначе сюда не дошли бы.
                    if (actual != expectedSha)
                    {
                        SendUpdateError(
                            "Контрольная сумма не совпала. Ожидалось " + expectedSha +
                            ", получено " + actual + ". Установка отменена.");
                        try { File.Delete(tmp); } catch { }
                        return;
                    }
                    SendLog("success", "SHA-256 совпал: " + actual, "Updater");

                    SendUpdateProgress(96, "Подготовка замены...");

                    string target = Application.ExecutablePath;
                    int pid = Process.GetCurrentProcess().Id;
                    string cmdPath = Path.Combine(dir, "apply_update.cmd");

                    // Скрипт целиком в ASCII, пути приходят через переменные
                    // окружения. Так надо: cmd.exe разбирает .cmd в OEM-кодировке
                    // (866 на русской Windows), а Encoding.Default — это ANSI
                    // (1251). Записанный в ANSI кириллический путь читался как
                    // "╥хёЄ" вместо "Тест", copy падал, и обновление молча не
                    // ставилось у всех, у кого кириллица в пути. Окружение
                    // передаётся процессу в Unicode и от кодировок не зависит.
                    //
                    // ping вместо timeout: timeout требует консоли, а .cmd
                    // запускается скрытым.
                    var script = new StringBuilder();
                    script.AppendLine("@echo off");
                    script.AppendLine(":wait");
                    script.AppendLine("tasklist /FI \"PID eq " + pid + "\" 2>nul | find \"" + pid + "\" >nul");
                    script.AppendLine("if not errorlevel 1 (");
                    script.AppendLine("  ping -n 2 127.0.0.1 >nul");
                    script.AppendLine("  goto wait");
                    script.AppendLine(")");
                    script.AppendLine("ping -n 2 127.0.0.1 >nul");
                    script.AppendLine("copy /y \"%ZAPRET_UPDATE_SRC%\" \"%ZAPRET_UPDATE_DST%\" >nul");
                    script.AppendLine("if errorlevel 1 goto fail");
                    // Скачанная сборка весит десятки мегабайт, оставлять её незачем.
                    script.AppendLine("del /q \"%ZAPRET_UPDATE_SRC%\" >nul 2>nul");
                    script.AppendLine("start \"\" \"%ZAPRET_UPDATE_DST%\"");
                    script.AppendLine("(goto) 2>nul & del \"%~f0\"");
                    script.AppendLine(":fail");
                    // Никакого pause: консоли нет (CreateNoWindow), и процесс
                    // висел бы вечно невидимым. Причину оставляем в файле.
                    script.AppendLine("> \"%~dp0update-failed.log\" echo copy failed");
                    script.AppendLine(">> \"%~dp0update-failed.log\" echo src=%ZAPRET_UPDATE_SRC%");
                    script.AppendLine(">> \"%~dp0update-failed.log\" echo dst=%ZAPRET_UPDATE_DST%");
                    script.AppendLine("exit /b 1");

                    File.WriteAllText(cmdPath, script.ToString(), Encoding.ASCII);

                    SendUpdateProgress(100, "Перезапуск...");
                    SendLog("success", "Обновление до " + version + " готово, приложение перезапускается.", "Updater");

                    var psi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c \"" + cmdPath + "\"",
                        WorkingDirectory = dir,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    psi.EnvironmentVariables["ZAPRET_UPDATE_SRC"] = tmp;
                    psi.EnvironmentVariables["ZAPRET_UPDATE_DST"] = target;
                    Process.Start(psi);

                    // Ядро надо снять до выхода, иначе останется висеть winws
                    // с загруженным драйвером.
                    this.BeginInvoke(new Action(() =>
                    {
                        isExiting = true;
                        StopZapretProcess(false);
                        KillZombieWinDivert();
                        Application.Exit();
                    }));
                }
                catch (Exception ex)
                {
                    var inner = ex;
                    while (inner.InnerException != null) inner = inner.InnerException;
                    SendUpdateError("Не удалось обновиться: " + inner.Message);
                    try { if (tmp != null && File.Exists(tmp)) File.Delete(tmp); } catch { }
                }
            });
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
        /// Пробует выгрузить драйвер WinDivert при полном выходе.
        /// </summary>
        /// <remarks>
        /// Только stop, БЕЗ delete. Разница принципиальная: WinDivert —
        /// общая инфраструктура, его используют некоторые VPN, ускорители игр
        /// и антивирусы. Остановку Windows не выполнит, если у драйвера есть
        /// открытые дескрипторы, — то есть чужую работу мы сломать не можем,
        /// команда просто вернёт ошибку. А вот delete снимает регистрацию
        /// службы и способен помешать соседу, поэтому здесь его нет; он
        /// остаётся только в аварийном ResetWinDivertService.
        ///
        /// На трафик выгрузка не влияет: фильтры WinDivert живут вместе с
        /// дескриптором winws и снимаются в момент его завершения. К этому
        /// вызову драйвер уже ничего не перехватывает.
        /// </remarks>
        private void TryStopWinDivertService()
        {
            foreach (string service in new string[] { "WinDivert", "windivert", "WinDivert14" })
            {
                try
                {
                    using (var sc = new ServiceController(service))
                    {
                        // Обращение к Status бросает исключение, если службы нет.
                        if (sc.Status == ServiceControllerStatus.Stopped) continue;

                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(3));
                        SendLog("info", "Драйвер WinDivert выгружен (служба " + service + ").", "WinDivert");
                        return;
                    }
                }
                catch (InvalidOperationException)
                {
                    // Службы с таким именем нет — пробуем следующее имя.
                }
                catch (Exception ex)
                {
                    SendLog("info",
                        "Драйвер WinDivert остался загруженным: " + ex.Message +
                        ". Обычно это значит, что им пользуется другая программа. На работу сети это не влияет.",
                        "WinDivert");
                    return;
                }
            }
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

        [DllImport("dnsapi.dll", EntryPoint = "DnsFlushResolverCache", SetLastError = true)]
        private static extern uint DnsFlushResolverCache();

        /// <summary>
        /// Сбрасывает кэш DNS распознавателя Windows.
        /// </summary>
        /// <remarks>
        /// Нужно потому, что до включения обхода система могла закэшировать
        /// адреса, подменённые провайдером. Пока запись живёт в кэше, она
        /// используется и с включённым обходом.
        ///
        /// Вызывается напрямую через dnsapi.dll, а не запуском ipconfig через
        /// оболочку. Причина не в скорости: «программа скрыто запускает
        /// командную оболочку» — ровно тот признак, за который эвристика
        /// антивирусов помечает сборку (см. docs/antivirus-false-positive.md).
        /// Здесь не порождается ни одного процесса.
        ///
        /// DnsFlushResolverCache не документирован, поэтому если экспорта не
        /// окажется — откатываемся на ipconfig.exe, запущенный НАПРЯМУЮ, без
        /// cmd.exe.
        ///
        /// Своё действие эта чистка не переоценивает: у Discord и браузеров
        /// есть собственный кэш DNS внутри процесса, на уже запущенное
        /// приложение системный сброс не влияет.
        /// </remarks>
        private void FlushDnsCache()
        {
            try
            {
                uint rc = DnsFlushResolverCache();
                if (rc != 0)
                {
                    SendLog("info", "Кэш DNS сброшен (код " + rc + ").", "DNS");
                    return;
                }
                SendLog("info", "Кэш DNS сброшен.", "DNS");
            }
            catch (Exception ex)
            {
                // EntryPointNotFoundException или DllNotFoundException — редкий
                // случай, но молчать о нём нельзя.
                SendLog("info", "Прямой сброс кэша DNS недоступен (" + ex.GetType().Name + "), пробуем ipconfig.", "DNS");
                RunSilent("ipconfig.exe", "/flushdns");
                SendLog("info", "Кэш DNS сброшен через ipconfig.", "DNS");
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

        /// <summary>
        /// Выделяет из строки вывода ядра признаки реальной работы.
        ///
        /// Считаются две вещи: применённые десинхронизации («dpi desync src=»)
        /// и распознанные имена хостов («hostname: X»). Первое означает, что
        /// профиль сработал; второе — что до ядра вообще доходит TLS с SNI.
        /// Обе метрики нужны только при --debug, без него ядро молчит.
        /// </summary>
        private void CountActivity(string line)
        {
            if (line.Length < 8) return;

            if (line.IndexOf("dpi desync src=", StringComparison.Ordinal) >= 0)
            {
                Interlocked.Increment(ref desyncCount);
                return;
            }

            int h = line.IndexOf("hostname: ", StringComparison.Ordinal);
            if (h >= 0)
            {
                string host = line.Substring(h + 10).Trim();
                if (host.Length == 0 || host.Length > 253) return;
                lock (activityLock)
                {
                    if (seenHosts.Add(host))
                    {
                        hostnameCount = seenHosts.Count;
                        if (hostsSinceSummary.Count < 40) hostsSinceSummary.Add(host);
                        else hostsSinceSummaryMore++;
                    }
                }
            }
        }

        private void ResetActivity()
        {
            Interlocked.Exchange(ref desyncCount, 0);
            lock (activityLock)
            {
                seenHosts.Clear();
                hostnameCount = 0;
                hostsSinceSummary.Clear();
                hostsSinceSummaryMore = 0;
            }
            lastSentDesync = -1;
            lastSentHosts = -1;
            lastSummaryDesync = 0;
            lastSummaryUtc = DateTime.UtcNow;
        }

        /// <summary>Отправляет счётчики в интерфейс, только если они изменились.</summary>
        private void PushActivity()
        {
            MaybeWriteActivitySummary();
            if (autotuneRunning) return;

            long d = Interlocked.Read(ref desyncCount);
            long h;
            lock (activityLock) { h = hostnameCount; }
            if (d == lastSentDesync && h == lastSentHosts) return;
            lastSentDesync = d;
            lastSentHosts = h;

            SendToWeb(string.Format(
                "{{\"type\":\"activity\",\"desync\":{0},\"hosts\":{1}}}", d, h));
        }

        /// <summary>
        /// Строки --debug, которые описывают каждый пакет и ничего не говорят
        /// о решениях ядра.
        /// </summary>
        /// <remarks>
        /// Во время звонка Discord голос идёт ~50 пакетами в секунду, и на
        /// каждый ядро печатает пять строк: заголовок пакета, адреса, «cached
        /// profile», «unknown protocol», «reinject». Журнал рос на 10 МБ за
        /// 10 минут, пять архивов вмещали меньше часа, и запуск Discord, ради
        /// разбора которого журнал и открывают, оказывался уже затёрт
        /// (замер 2026-10-12: 55 тыс. строк про один голосовой сервер за час).
        /// Строки про TCP, ClientHello, имена хостов и десинхронизацию
        /// остаются — по ним и идёт разбор.
        /// </remarks>
        private static bool IsPacketNoise(string line)
        {
            if (line.IndexOf("using cached desync profile", StringComparison.Ordinal) >= 0) return true;
            if (line.IndexOf("reinject unmodified", StringComparison.Ordinal) >= 0) return true;
            if (line.IndexOf("not applying tampering to unknown protocol", StringComparison.Ordinal) >= 0) return true;
            if (line.StartsWith("packet: id=", StringComparison.Ordinal) && line.IndexOf(" len=", StringComparison.Ordinal) > 0) return true;
            if ((line.StartsWith("IP4: ", StringComparison.Ordinal) || line.StartsWith("IP6: ", StringComparison.Ordinal)) &&
                line.IndexOf("proto=udp", StringComparison.Ordinal) > 0) return true;
            if (line.StartsWith("incoming hops guessed", StringComparison.Ordinal) ||
                line.StartsWith("incoming TTL", StringComparison.Ordinal) ||
                line.StartsWith("using cached hops", StringComparison.Ordinal)) return true;
            return false;
        }

        private void HandleWinwsOutput(string line, bool isError)
        {
            if (string.IsNullOrEmpty(line)) return;

            CountActivity(line);
            if (autotuneRunning && !tuneTraces.IsEmpty) TraceCoreLine(line);

            // Пакетный шум в файл не пишем. Счётчики и трассировка подбора
            // выше уже получили строку — они работают по полному потоку.
            if (!isError && IsPacketNoise(line)) return;

            WriteTraceLine(line);

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
            else if (InCoreStartupWindow())
            {
                // Настройки, профили, фильтр WinDivert — то, что нужно при
                // разборе любого случая, — остаются и в общем журнале.
                SendLog("info", line, "WinWS");
            }
            else
            {
                SendUiLog("info", line, "WinWS");
            }
        }

        /// <summary>Первые секунды после запуска ядра (не во время автоподбора).</summary>
        private bool InCoreStartupWindow()
        {
            if (autotuneRunning) return false;
            if ((DateTime.UtcNow - coreOutputSinceUtc).TotalSeconds > CORE_STARTUP_SEC) return false;
            return Interlocked.Increment(ref coreStartupLines) <= CORE_STARTUP_LINES;
        }

        /// <summary>
        /// Сводка в общий журнал: ядро живо, сколько обработало, какие сайты
        /// появились. С --debug — раз в 10 минут, без него — раз в час: счётчиков
        /// тогда нет, но видно, что ядро работало. Вызывается таймером раз в секунду.
        /// </summary>
        private void MaybeWriteActivitySummary()
        {
            if (autotuneRunning) return;
            lock (procLock) { if (confirmedCore == null) return; }

            DateTime now = DateTime.UtcNow;
            int periodMin = coreDebug ? ACTIVITY_SUMMARY_MIN : 60;
            if ((now - lastSummaryUtc).TotalMinutes < periodMin) return;
            lastSummaryUtc = now;

            string uptime = FormatDuration(now - coreStartedUtc);
            if (!coreDebug)
            {
                WriteLogFile("info", "Core", "Ядро работает " + uptime + ". Счётчиков нет — подробный журнал выключен.");
                return;
            }

            long d = Interlocked.Read(ref desyncCount);
            long delta = d - lastSummaryDesync;
            lastSummaryDesync = d;
            string[] fresh;
            int more, total;
            lock (activityLock)
            {
                fresh = hostsSinceSummary.ToArray();
                more = hostsSinceSummaryMore;
                total = seenHosts.Count;
                hostsSinceSummary.Clear();
                hostsSinceSummaryMore = 0;
            }

            var sb = new StringBuilder();
            sb.AppendFormat("Ядро работает {0}: за {1} мин обработано соединений {2} (всего {3}), сайтов распознано {4}",
                uptime, periodMin, delta, d, total);
            if (fresh.Length == 0) sb.Append(", новых нет.");
            else
            {
                sb.Append(", новые: ").Append(string.Join(", ", fresh));
                if (more > 0) sb.AppendFormat(" и ещё {0}", more);
                sb.Append('.');
            }
            WriteLogFile("info", "Core", sb.ToString());
        }

        /// <summary>
        /// Запускает ядро winws.exe с переданными аргументами и достоверно
        /// сообщает интерфейсу, поднялось оно или нет.
        /// </summary>
        private void StartZapretProcess(string arguments)
        {
            StartZapretProcess(arguments, false);
        }

        /// <param name="isRestart">
        /// Перезапуск после падения: серия попыток продолжается, а если ядро
        /// снова умрёт на старте — назначается следующая попытка.
        /// </param>
        private void StartZapretProcess(string arguments, bool isRestart)
        {
            StopZapretProcess(false);
            if (!isRestart) coreRestartAttempt = 0;

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
            ResetActivity();

            WarnIfSystemProxy();

            // Чистим кэш до старта ядра: записи, подменённые провайдером,
            // иначе продолжат использоваться уже при включённом обходе.
            // При автоподборе пропускаем — ядро там перезапускается на каждый
            // вариант, и семь одинаковых строк в логе только мешают.
            if (!autotuneRunning) FlushDnsCache();

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

                coreDebug = (" " + cleanArgs + " ").Contains(" --debug ");
                coreOutputSinceUtc = DateTime.UtcNow;
                Interlocked.Exchange(ref coreStartupLines, 0);
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
                    SendLog("warn", isRestart
                        ? "Служба WinDivert сброшена."
                        : "Служба WinDivert сброшена. Нажмите Включить ещё раз.", "WinDivert");
                }
                else if (reason.Length == 0)
                {
                    SendLog("warn", "Ядро не вернуло текст ошибки. Включите Подробный лог и повторите запуск.", "Runner");
                }

                // Первый запуск, который упал сразу, — это ошибка настройки,
                // её показываем как раньше. А при перезапуске пробуем дальше:
                // драйвер мог ещё не освободиться после падения.
                if (isRestart && TryScheduleCoreRestart()) return;

                SendStatus("error", 0);
                return;
            }

            if (!autotuneRunning)
            {
                lastCoreArgs = arguments;
                coreStartedUtc = DateTime.UtcNow;
            }
            lock (procLock) { confirmedCore = p; }

            SendLog("success", string.Format("winws.exe работает (PID {0})", p.Id), "WinWS");
            SendLog("info", "Драйвер WinDivert загружен, трафик фильтруется.", "WinDivert");
            if (isRestart) SendLog("success", "Ядро перезапущено — обход снова работает.", "Watchdog");
            SendStatus("connected", p.Id);

            // Умерло между проверкой и этой строкой — событие Exited могло
            // прийти раньше, чем ядро признано рабочим, и было пропущено.
            if (p.HasExited) WinwsExited(p, EventArgs.Empty);
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
                if (!ReferenceEquals(winws, p) || !ReferenceEquals(confirmedCore, p)) return;
                winws = null;
                confirmedCore = null;
            }

            if (stopRequested) return;

            int code = 0;
            try { if (p != null) code = p.ExitCode; } catch { }
            // Время работы засекается только для обычных запусков: у варианта
            // автоподбора оно было бы посчитано от чужого старта.
            TimeSpan ran = DateTime.UtcNow - coreStartedUtc;
            SendLog("error", string.Format("Ядро winws.exe неожиданно завершилось (код {0}{1}).",
                code, autotuneRunning ? "" : ", проработало " + FormatDuration(ran)), "Core");

            // Вариант, уронивший ядро во время автоподбора, отбраковывает сам
            // подбор — перезапуск ему только помешал бы.
            if (!autotuneRunning)
            {
                if (ran.TotalSeconds >= CoreStableSec) coreRestartAttempt = 0;
                if (TryScheduleCoreRestart()) return;
            }

            SendLog("error", "Обход отключён.", "Core");
            SendStatus("error", 0);
        }

        /// <summary>
        /// Назначает перезапуск упавшего ядра. false — перезапуска не будет
        /// (серия исчерпана, работает чужой обходчик, программа закрывается),
        /// и вызывающий сообщает интерфейсу об ошибке как раньше.
        /// </summary>
        private bool TryScheduleCoreRestart()
        {
            string args = lastCoreArgs;
            if (isExiting || string.IsNullOrEmpty(args)) return false;

            int max = CoreRestartDelaysSec.Length;
            if (coreRestartAttempt >= max)
            {
                SendLog("error", string.Format(
                    "Перезапуск не помог: ядро падает снова и снова ({0} попыток подряд). Больше не пробую — причина в строках журнала выше.",
                    max), "Watchdog");
                return false;
            }

            // Ядро могло умереть, потому что драйвер забрал другой обходчик.
            // Перезапуск снял бы его (запуск убивает все winws.exe) и начал
            // бы войну за драйвер.
            string rival = FindRivalBypass();
            if (rival != null)
            {
                SendLog("warn", "Не перезапускаю ядро: в системе работает " + rival +
                    ". Два обходчика на одном драйвере WinDivert мешают друг другу — закройте лишний и включите обход снова.", "Watchdog");
                return false;
            }

            int delay = CoreRestartDelaysSec[coreRestartAttempt];
            coreRestartAttempt++;
            SendLog("warn", string.Format("Перезапуск ядра через {0} с — попытка {1} из {2}.",
                delay, coreRestartAttempt, max), "Watchdog");
            SendStatus("restarting", 0, string.Format(",\"delay\":{0},\"attempt\":{1},\"max\":{2}",
                delay, coreRestartAttempt, max));

            lock (procLock)
            {
                if (coreRestartTimer != null) { try { coreRestartTimer.Dispose(); } catch { } }
                int gen = ++coreRestartGen;
                coreRestartTimer = new System.Threading.Timer(_ =>
                {
                    if (isExiting || !IsHandleCreated) return;
                    try
                    {
                        BeginInvoke(new Action(() =>
                        {
                            // Пока ждали, обход выключили или запустили заново.
                            lock (procLock) { if (gen != coreRestartGen) return; }
                            if (isExiting) return;
                            StartZapretProcess(args, true);
                        }));
                    }
                    catch { }
                }, null, delay * 1000, Timeout.Infinite);
            }
            return true;
        }

        /// <summary>Отменяет назначенный перезапуск: обход выключили, запустили заново или закрывают программу.</summary>
        private void CancelCoreRestart()
        {
            lock (procLock)
            {
                coreRestartGen++;
                if (coreRestartTimer != null)
                {
                    try { coreRestartTimer.Dispose(); } catch { }
                    coreRestartTimer = null;
                }
            }
        }

        /// <summary>
        /// Чужой обходчик в системе или null. Вызывается, когда своего ядра
        /// уже нет, поэтому любой живой winws.exe — чужой.
        /// </summary>
        private static string FindRivalBypass()
        {
            string found = null;
            try
            {
                foreach (var p in Process.GetProcessesByName("winws"))
                {
                    if (found == null) found = "другой winws.exe (PID " + p.Id + ")";
                    p.Dispose();
                }
                foreach (var n in RivalBypassNames)
                {
                    foreach (var p in Process.GetProcessesByName(n))
                    {
                        if (found == null) found = p.ProcessName;
                        p.Dispose();
                    }
                }
            }
            catch { }
            return found;
        }

        /// <summary>«2 ч 5 мин», «3 мин 10 с», «8 с» — для журнала.</summary>
        private static string FormatDuration(TimeSpan t)
        {
            if (t.TotalSeconds < 0 || t.TotalDays > 365) return "неизвестно сколько";
            if (t.TotalHours >= 1) return string.Format("{0} ч {1} мин", (int)t.TotalHours, t.Minutes);
            if (t.TotalMinutes >= 1) return string.Format("{0} мин {1} с", (int)t.TotalMinutes, t.Seconds);
            return string.Format("{0} с", (int)t.TotalSeconds);
        }

        private void StopZapretProcess()
        {
            StopZapretProcess(true);
        }

        private void StopZapretProcess(bool notify)
        {
            stopRequested = true;
            CancelCoreRestart();

            Process p;
            lock (procLock)
            {
                p = winws;
                winws = null;
                confirmedCore = null;
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
                LogProbeBinding("Diagnostics");

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
                        using (var tcp = CreateProbeClient())
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
                using (var tcp = CreateProbeClient())
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
                        var tls = ssl.AuthenticateAsClientAsync(sni, null, ProbeTls, false);
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

        // =================================================================
        //  Автоподбор стратегии
        //
        //  Перебирает варианты обхода, поднимая ядро с каждым, и после
        //  каждого делает настоящую проверку: TCP + TLS с нужным SNI.
        //
        //  Два принципиальных момента:
        //   * проверка идёт через TcpClient/SslStream, а они системный прокси
        //     НЕ используют. Иначе мы проверяли бы прокси, а не обход;
        //   * имена резолвятся ОДИН раз до начала перебора, и дальше все
        //     варианты идут на один и тот же IP — иначе DNS становится
        //     ещё одной переменной и результаты нельзя сравнивать.
        // =================================================================


        // =================================================================
        //  Привязка проверок к физическому адаптеру
        //
        //  Автоподбор и диагностика обязаны мерить канал ПРОВАЙДЕРА. Если
        //  этого не делать, результат превращается в ложь: у человека поднят
        //  VPN, проверка уходит в туннель, там работает всё — и подбор
        //  радостно сообщает, что прошли все семь вариантов.
        //
        //  Обойти системный прокси мало. Прокси — это настройка, её честно
        //  игнорирует любой обычный сокет. А туннельный адаптер (WireGuard,
        //  WinTun, Tailscale, SOCKS-туннели) перехватывает трафик маршрутом,
        //  и никакая настройка тут не поможет: нужно явно привязать сокет к
        //  адресу физической сетевой карты.
        //
        //  Отличаем физический адаптер от туннеля по двум признакам сразу:
        //  у туннеля обычно нет настоящего MAC-адреса, а в описании почти
        //  всегда есть опознаваемое слово. Ни один признак поодиночке не
        //  надёжен, вместе — достаточно.
        // =================================================================

        private static readonly string[] TunnelMarkers = new string[]
        {
            "tun", "tap", "vpn", "wireguard", "wintun", "openvpn", "tailscale",
            "zerotier", "hamachi", "radmin", "proton", "nord", "express",
            "socks", "loopback", "virtual", "pseudo", "teredo", "isatap"
        };

        private static bool LooksLikeTunnel(System.Net.NetworkInformation.NetworkInterface ni)
        {
            string text = ((ni.Description ?? "") + " " + (ni.Name ?? "")).ToLowerInvariant();
            foreach (string m in TunnelMarkers)
                if (text.Contains(m)) return true;

            // У туннельных адаптеров MAC либо пустой, либо нулевой.
            try
            {
                byte[] mac = ni.GetPhysicalAddress().GetAddressBytes();
                if (mac.Length < 6) return true;
                bool allZero = true;
                foreach (byte b in mac) if (b != 0) { allZero = false; break; }
                if (allZero) return true;
            }
            catch { }

            return false;
        }

        /// <summary>
        /// Локальный IPv4-адрес физической сетевой карты с настроенным шлюзом.
        /// null — подходящего адаптера нет, тогда сокет пойдёт как обычно.
        /// </summary>
        private static IPAddress FindPhysicalLocalAddress()
        {
            try
            {
                foreach (System.Net.NetworkInformation.NetworkInterface ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Loopback) continue;
                    if (LooksLikeTunnel(ni)) continue;

                    System.Net.NetworkInformation.IPInterfaceProperties props = ni.GetIPProperties();

                    // Без шлюза адаптер никуда наружу не ведёт.
                    bool hasGateway = false;
                    foreach (System.Net.NetworkInformation.GatewayIPAddressInformation g in props.GatewayAddresses)
                    {
                        if (g.Address != null && g.Address.AddressFamily == AddressFamily.InterNetwork
                            && !g.Address.Equals(IPAddress.Any)) { hasGateway = true; break; }
                    }
                    if (!hasGateway) continue;

                    foreach (System.Net.NetworkInformation.UnicastIPAddressInformation ua in props.UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily == AddressFamily.InterNetwork)
                            return ua.Address;
                    }
                }
            }
            catch { }
            return null;
        }

        /// <summary>
        /// TcpClient, привязанный к физическому адаптеру, если его удалось найти.
        /// </summary>
        private static TcpClient CreateProbeClient()
        {
            IPAddress local = FindPhysicalLocalAddress();
            if (local == null) return new TcpClient();
            try { return new TcpClient(new IPEndPoint(local, 0)); }
            catch { return new TcpClient(); }
        }


        /// <summary>
        /// Пишет в журнал, каким адаптером пойдут проверки. Молчать здесь
        /// нельзя: от выбора адаптера зависит, что именно измерено — канал
        /// провайдера или чужой туннель.
        /// </summary>
        private void LogProbeBinding(string source)
        {
            IPAddress local = FindPhysicalLocalAddress();
            if (local != null)
                SendLog("info", "Проверки идут через физический адаптер " + local + " — туннели и VPN в обход.", source);
            else
                SendLog("warn",
                    "Физический адаптер не найден, проверки пойдут обычным маршрутом. " +
                    "Если поднят VPN или туннель, результат будет про него, а не про вашего провайдера.", source);
        }


        // =================================================================
        //  Куда на самом деле уходит трафик
        //
        //  Проверять «есть ли в системе туннельный адаптер» мало: адаптер
        //  может быть поднят и при этом ничего не забирать. Значение имеет
        //  одно — какой интерфейс выберет система для выхода в интернет.
        //  Это решает таблица маршрутизации, и спросить её можно напрямую.
        //
        //  Зачем это ядру. WinDivert перехватывает пакеты на уровне IP,
        //  включая те, что идут В туннельный адаптер, то есть ещё НЕ
        //  зашифрованные. Без ограничения по интерфейсу winws резал бы
        //  содержимое чужого туннеля: провайдер там всё равно ничего не
        //  видит, пользы ноль, а испортить соединение можно. Поэтому ядру
        //  передаётся --wf-iface с индексом физической карты.
        // =================================================================

        [DllImport("iphlpapi.dll", SetLastError = true)]
        private static extern int GetBestInterfaceEx(byte[] sockaddr, out int bestIfIndex);

        private class EgressInfo
        {
            /// <summary>Интерфейс, которым система пойдёт в интернет.</summary>
            public int IfIdx;
            public string Name = "";
            /// <summary>Этот интерфейс — туннель (VPN, WireGuard, SOCKS-туннель).</summary>
            public bool IsTunnel;
            /// <summary>Физическая карта: к ней привязывается ядро и проверки.</summary>
            public int PhysIfIdx;
            public string PhysName = "";
        }

        /// <summary>Индекс интерфейса, которым система пойдёт к публичному адресу.</summary>
        private static int GetEgressIfIndex()
        {
            try
            {
                // sockaddr_in для 1.1.1.1: AF_INET, порт 0, адрес, 8 нулей.
                byte[] sa = new byte[16];
                sa[0] = 2; // AF_INET
                sa[4] = 1; sa[5] = 1; sa[6] = 1; sa[7] = 1;

                int idx;
                if (GetBestInterfaceEx(sa, out idx) == 0) return idx;
            }
            catch { }
            return 0;
        }

        private static System.Net.NetworkInformation.NetworkInterface FindByIndex(int idx)
        {
            if (idx == 0) return null;
            try
            {
                foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    try
                    {
                        var p = ni.GetIPProperties();
                        var v4 = p.GetIPv4Properties();
                        if (v4 != null && v4.Index == idx) return ni;
                    }
                    catch { }
                }
            }
            catch { }
            return null;
        }

        /// <summary>Физический сетевой интерфейс — тот же отбор, что и для проверок.</summary>
        private static System.Net.NetworkInformation.NetworkInterface FindPhysicalInterface()
        {
            try
            {
                foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Loopback) continue;
                    if (LooksLikeTunnel(ni)) continue;

                    var props = ni.GetIPProperties();
                    bool hasGateway = false;
                    foreach (var g in props.GatewayAddresses)
                    {
                        if (g.Address != null && g.Address.AddressFamily == AddressFamily.InterNetwork
                            && !g.Address.Equals(IPAddress.Any)) { hasGateway = true; break; }
                    }
                    if (!hasGateway) continue;

                    foreach (var ua in props.UnicastAddresses)
                        if (ua.Address.AddressFamily == AddressFamily.InterNetwork) return ni;
                }
            }
            catch { }
            return null;
        }

        private EgressInfo DescribeEgress()
        {
            var info = new EgressInfo();

            int egress = GetEgressIfIndex();
            var egressNi = FindByIndex(egress);
            if (egressNi != null)
            {
                info.IfIdx = egress;
                info.Name = egressNi.Name;
                info.IsTunnel = LooksLikeTunnel(egressNi);
            }

            var phys = FindPhysicalInterface();
            if (phys != null)
            {
                info.PhysName = phys.Name;
                try { info.PhysIfIdx = phys.GetIPProperties().GetIPv4Properties().Index; }
                catch { }
            }

            // Выход не через туннель — значит физическая карта и есть выход.
            if (!info.IsTunnel && info.IfIdx != 0)
            {
                info.PhysIfIdx = info.IfIdx;
                info.PhysName = info.Name;
            }

            return info;
        }

        /// <summary>Индекс, который уходит в --wf-iface. 0 — не ограничивать.</summary>
        private int WfIfaceIndex()
        {
            var e = DescribeEgress();
            return e.PhysIfIdx;
        }

        private void SendNetRoute()
        {
            var e = DescribeEgress();
            SendToWeb(string.Format(
                "{{\"type\":\"net_route\",\"ifIdx\":{0},\"name\":\"{1}\",\"isTunnel\":{2},\"physIfIdx\":{3},\"physName\":\"{4}\"}}",
                e.IfIdx, JsonEscape(e.Name), e.IsTunnel ? "true" : "false",
                e.PhysIfIdx, JsonEscape(e.PhysName)));
        }

        /// <summary>
        /// Версия TLS для проверок через SslStream — вкладка «Диагностика».
        /// Автоподбор с 0.3.3 шлёт приветствие браузера (ChromeHello).
        /// </summary>
        /// <remarks>
        /// Без явного указания .NET Framework в exe, собранном csc без атрибута
        /// TargetFramework, работает в режиме совместимости с 4.0 и шлёт
        /// ClientHello TLS 1.0: 115 байт, семь старых шифров, без
        /// signature_algorithms. Discord (Cloudflare) и GitHub такое отвергают
        /// за ~120 мс ошибкой «Указанная функция не поддерживается».
        ///
        /// Из-за этого автоподбор никогда не мог найти стратегию для Discord:
        /// рабочий multidisorder проводил запрос мимо DPI, сервер отказывал
        /// по версии TLS, и вариант считался провалом. Вкладка «Диагностика»
        /// врала так же. Разобрано 2026-09-24, MEMORY §8.
        ///
        /// В PowerShell значения по умолчанию другие — там уходит TLS 1.2, и
        /// проверка «а не в версии ли дело» из PowerShell дала ложное «нет».
        /// </remarks>
        private const SslProtocols ProbeTls = SslProtocols.Tls12;

        private class TuneProbe
        {
            public string Host;
            public string Ip;
            /// <summary>
            /// Порт цели. Обычно 443; медиасерверы Discord проверяются на 2053 —
            /// это отдельный профиль ядра (альтернативные порты Cloudflare).
            /// </summary>
            public int Port = 443;
            /// <summary>Все IPv4-адреса цели из DNS и номер текущего в этом списке.</summary>
            public System.Collections.Generic.List<string> Candidates;
            public int IpIndex;
            /// <summary>Проверялась ли цель в текущем круге перебора и открылась ли хоть раз.</summary>
            public bool Tested;
            public bool EverPassed;
        }

        /// <summary>Что случилось с одной пробой — и что о ней сказало ядро.</summary>
        private class ProbeTrace
        {
            public string Host;
            public string Ip;
            public int Port;
            public bool Ok;
            public string Result = "";
            /// <summary>Строк ядра об этом соединении — видело ли оно пробу вообще.</summary>
            public int Packets;
            /// <summary>Сколько раз ядро применило к нему десинхронизацию.</summary>
            public int Desync;
            /// <summary>Какое имя ядро прочитало в ClientHello.</summary>
            public string Hostname;
            /// <summary>Входящие сбросы и их TTL — подпись вмешательства DPI.</summary>
            public int Rst;
            public string RstTtl = "";

            public string Describe()
            {
                string core;
                if (Port == 0) core = "до ядра не дошло";
                else if (Packets == 0 && Desync == 0) core = "ядро это соединение НЕ ВИДЕЛО";
                else
                {
                    core = "ядро: строк " + Packets + ", обработано " + Desync + " раз";
                    if (!string.IsNullOrEmpty(Hostname)) core += ", имя «" + Hostname + "»";
                    if (Desync == 0) core += " — БЕЗ ОБРАБОТКИ";
                }
                if (Rst > 0) core += "; сбросов RST: " + Rst + " (ttl " + RstTtl.TrimEnd(',', ' ') + ")";
                return string.Format("{0} @ {1} :{2}  {3} | {4}", Host, Ip, Port, Result, core);
            }
        }

        /// <summary>Пробы, которые сейчас в полёте: локальный порт -> трассировка.</summary>
        private readonly System.Collections.Concurrent.ConcurrentDictionary<int, ProbeTrace> tuneTraces =
            new System.Collections.Concurrent.ConcurrentDictionary<int, ProbeTrace>();
        /// <summary>Последнее имя из ClientHello, напечатанное ядром: оно идёт строкой перед «dpi desync».</summary>
        private volatile string lastCoreHostname;
        private static readonly Regex CorePortRx = new Regex(@"(?:src=\d+\.\d+\.\d+\.\d+:|sport=|dport=)(\d+)", RegexOptions.Compiled);
        private static readonly Regex CoreTtlRx = new Regex(@"ttl=(\d+)", RegexOptions.Compiled);
        private static readonly Regex CoreFlagsRx = new Regex(@"flags=([A-Z]+)", RegexOptions.Compiled);

        /// <summary>
        /// Отчёт автоподбора, отдельный от общего журнала.
        /// </summary>
        /// <remarks>
        /// Общий журнал с --debug набирает 10 МБ минут за десять и уходит в
        /// ротацию. Ложные нули подбора 22.09 так и потерялись: когда дошли
        /// руки разбираться, журналов того часа уже не было. Отчёт подбора
        /// маленький и хранится отдельно, последние пять штук.
        /// </remarks>
        private StringBuilder tuneReport;
        private readonly object tuneReportLock = new object();

        private void TuneReport(string line)
        {
            lock (tuneReportLock)
            {
                if (tuneReport != null) tuneReport.Append(line).Append("\r\n");
            }
        }

        /// <summary>Разбирает строку ядра: относится ли она к одной из проб.</summary>
        private void TraceCoreLine(string line)
        {
            if (line.StartsWith("hostname: ", StringComparison.Ordinal))
            {
                lastCoreHostname = line.Substring(10).Trim();
                return;
            }
            foreach (Match m in CorePortRx.Matches(line))
            {
                int port;
                if (!int.TryParse(m.Groups[1].Value, out port)) continue;
                ProbeTrace t;
                if (!tuneTraces.TryGetValue(port, out t)) continue;
                lock (t)
                {
                    if (line.StartsWith("dpi desync", StringComparison.Ordinal))
                    {
                        t.Desync++;
                        if (lastCoreHostname != null) t.Hostname = lastCoreHostname;
                    }
                    else
                    {
                        t.Packets++;
                        // Входящий сброс: «IP4: сервер => мы ... dport=<наш порт> flags=AR».
                        // Буквы флагов идут в произвольном порядке, поэтому ищем R
                        // внутри значения, а не сразу после «flags=».
                        var fl = CoreFlagsRx.Match(line);
                        if (fl.Success && fl.Groups[1].Value.IndexOf('R') >= 0 &&
                            line.IndexOf("dport=" + port, StringComparison.Ordinal) >= 0)
                        {
                            t.Rst++;
                            var ttl = CoreTtlRx.Match(line);
                            if (ttl.Success) t.RstTtl += ttl.Groups[1].Value + ", ";
                        }
                    }
                }
                return;
            }
        }

        private void SaveTuneReport()
        {
            string text;
            lock (tuneReportLock)
            {
                if (tuneReport == null) return;
                text = tuneReport.ToString();
                tuneReport = null;
            }
            try
            {
                string dir = logDir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zapret2-GUI", "logs");
                Directory.CreateDirectory(dir);
                string path = Path.Combine(dir, "autotune-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".txt");
                File.WriteAllText(path, text, new UTF8Encoding(true));

                var files = new DirectoryInfo(dir).GetFiles("autotune-*.txt");
                Array.Sort(files, (x, y) => y.LastWriteTimeUtc.CompareTo(x.LastWriteTimeUtc));
                for (int i = 5; i < files.Length; i++) { try { files[i].Delete(); } catch { } }

                SendLog("info", "Подробный отчёт подбора: " + path, "Autotune");
            }
            catch (Exception ex)
            {
                SendLog("warn", "Отчёт подбора не записался: " + ex.Message, "Autotune");
            }
        }


        /// <summary>
        /// Одна проба: TCP и приветствие браузера с настоящим именем сайта.
        /// Успех — ServerHello, повторивший наш номер сессии.
        /// </summary>
        /// <remarks>
        /// Сертификат здесь не сверяется: в TLS 1.3 он зашифрован, а полное
        /// рукопожатие ради него удвоило бы время подбора. Заглушку провайдера
        /// отсекает повтор номера сессии — его знает только тот, кто получил
        /// наше приветствие.
        ///
        /// Локальный порт регистрируется в <see cref="tuneTraces"/> сразу после
        /// установки TCP — до того, как уйдёт ClientHello. Тогда строки ядра
        /// об этом соединении попадут в отчёт, и будет видно главное: видело ли
        /// ядро пробу вообще, обработало ли её и прислал ли DPI сброс.
        /// </remarks>
        private async Task<ProbeTrace> TryTlsProbe(TuneProbe pr, int connectMs, int tlsMs)
        {
            var tr = new ProbeTrace { Host = pr.Host, Ip = pr.Ip };
            var sw = Stopwatch.StartNew();
            try
            {
                using (var tcp = CreateProbeClient())
                {
                    var connect = tcp.ConnectAsync(pr.Ip, pr.Port);
                    if (await Task.WhenAny(connect, Task.Delay(connectMs)) != connect)
                    {
                        tr.Result = "TCP таймаут " + sw.ElapsedMilliseconds + " мс";
                        return tr;
                    }
                    await connect;
                    try { tr.Port = ((IPEndPoint)tcp.Client.LocalEndPoint).Port; } catch { }
                    if (tr.Port > 0) tuneTraces[tr.Port] = tr;

                    // Приветствие настоящего Chromium, а не .NET: см. ChromeHello.cs.
                    // Ждём только ServerHello — полное рукопожатие не нужно,
                    // вопрос один: пропустил ли DPI приветствие к серверу.
                    byte[] sid;
                    byte[] hello = ChromeHello.Build(pr.Host, out sid);
                    var stream = tcp.GetStream();
                    await stream.WriteAsync(hello, 0, hello.Length);

                    var buf = new byte[4096];
                    int n = 0;
                    while (n < ChromeHello.ResponseNeeded)
                    {
                        int left = tlsMs - (int)sw.ElapsedMilliseconds;
                        var read = stream.ReadAsync(buf, n, buf.Length - n);
                        if (left <= 0 || await Task.WhenAny(read, Task.Delay(left)) != read)
                        {
                            tr.Result = n == 0
                                ? "ответа нет за " + sw.ElapsedMilliseconds + " мс"
                                : "ответ оборвался на " + n + " байтах за " + sw.ElapsedMilliseconds + " мс";
                            return tr;
                        }
                        int got = await read;
                        if (got <= 0) break;
                        n += got;
                        // Не TLS-запись — дальше ждать бессмысленно, разберём как есть.
                        if (buf[0] != 0x16 && n >= 7) break;
                    }

                    string verdict;
                    tr.Ok = ChromeHello.Judge(buf, n, sid, out verdict);
                    tr.Result = (tr.Ok ? "OK, " : "") + verdict + " за " + sw.ElapsedMilliseconds + " мс";
                    return tr;
                }
            }
            catch (Exception ex)
            {
                var e = ex;
                while (e.InnerException != null) e = e.InnerException;
                string m = e.Message.Replace("\r", " ").Replace("\n", " ");
                if (m.Length > 90) m = m.Substring(0, 90);
                tr.Result = "ошибка через " + sw.ElapsedMilliseconds + " мс: " + e.GetType().Name + ": " + m;
                return tr;
            }
        }

        /// <summary>
        /// Проверяет одну цель несколько раз и возвращает число успехов.
        /// </summary>
        /// <remarks>
        /// Одна попытка ничего не доказывает: многие DPI пропускают первое
        /// соединение и режут следующие. Отсюда и жалобы «подобрал, а не
        /// работает».
        ///
        /// После двух провалов оставшиеся попытки пропускаем: до нужного
        /// счёта уже не дотянуть, а каждая неудачная проба стоит целого
        /// таймаута.
        /// </remarks>
        private async Task<int> ProbeTarget(TuneProbe pr, int attempts)
        {
            int ok = 0, failed = 0;
            for (int i = 0; i < attempts; i++)
            {
                if (autotuneCancel) break;
                var tr = await TryTlsProbe(pr, 4000, 6000);
                // Строки ядра приходят чуть позже самих событий — даём им дойти.
                await Task.Delay(150);
                if (tr.Port > 0) { ProbeTrace gone; tuneTraces.TryRemove(tr.Port, out gone); }
                TuneReport("    " + tr.Describe());
                if (tr.Ok) ok++;
                else if (++failed >= 2) break;

                // Соединения подряд без паузы выглядят для DPI иначе, чем
                // обычная работа браузера.
                if (i + 1 < attempts) await Task.Delay(250);
            }
            return ok;
        }

        private void SendTuneEvent(string json)
        {
            SendToWeb(json);
        }

        /// <summary>
        /// Запускает ядро и ждёт, пока оно поднимется. Возвращает false, если
        /// процесс умер сразу — такой вариант считается неработоспособным.
        /// </summary>
        private bool StartCoreForTune(string args)
        {
            StartZapretProcess(args);
            lock (procLock)
            {
                return winws != null && !winws.HasExited;
            }
        }


        /// <summary>Ставит вариант «выключено» первым в списке перебора.</summary>
        private static string[] MoveBaselineFirst(string[] variants)
        {
            int at = -1;
            for (int i = 0; i < variants.Length; i++)
            {
                if (variants[i].StartsWith("off|", StringComparison.OrdinalIgnoreCase)) { at = i; break; }
            }
            if (at <= 0) return variants;

            var list = new System.Collections.Generic.List<string>(variants);
            string baseline = list[at];
            list.RemoveAt(at);
            list.Insert(0, baseline);
            return list.ToArray();
        }


        /// <summary>
        /// Первый адрес из списка, который отвечает на TCP 443.
        /// </summary>
        /// <remarks>
        /// Проверяется именно установка соединения, без TLS: на этом этапе нас
        /// интересует только «жив ли адрес». Блокировка по имени сайта TCP не
        /// трогает, поэтому заблокированный, но живой адрес сюда проходит — и
        /// это правильно, его и надо проверять стратегиями.
        ///
        /// Вызывается с остановленным ядром, до перебора вариантов: адрес
        /// должен быть один и тот же для всех, иначе результаты несравнимы.
        /// </remarks>
        private int PickReachable(System.Collections.Generic.List<string> ips, int from, string host, int port)
        {
            for (int i = from; i < ips.Count; i++)
            {
                if (autotuneCancel) return -1;
                string ip = ips[i];
                try
                {
                    using (var tcp = CreateProbeClient())
                    {
                        var connect = tcp.ConnectAsync(ip, port);
                        if (connect.Wait(2500) && tcp.Connected) return i;
                    }
                }
                catch { }
                SendLog("info", host + ": адрес " + ip + " не отвечает, пробую следующий.", "Autotune");
            }
            return -1;
        }

        /// <summary>
        /// Сколько раз автоподбор может сменить адрес цели, на которой не
        /// прошёл ни один вариант. Каждый круг — полный перебор, около
        /// полутора минут, поэтому больше одного запасного не берём.
        /// </summary>
        private const int AutotuneAddressRetries = 1;

        /// <summary>
        /// Цели, которые проверялись и не открылись ни при одном варианте,
        /// переводит на следующий отвечающий адрес. Возвращает true, если
        /// хоть одна цель сменила адрес — тогда перебор имеет смысл повторить.
        /// </summary>
        private bool SwitchStuckProbes(System.Collections.Generic.List<TuneProbe> probes)
        {
            // PickReachable должен видеть сеть без обхода, как и при выборе
            // первого адреса.
            StopZapretProcess(false);

            bool switched = false;
            foreach (var pr in probes)
            {
                if (!pr.Tested || pr.EverPassed) continue;
                if (pr.Candidates == null || pr.IpIndex + 1 >= pr.Candidates.Count)
                {
                    TuneReport("    " + pr.Host + ": других адресов нет, остаёмся на " + pr.Ip);
                    continue;
                }

                int at = PickReachable(pr.Candidates, pr.IpIndex + 1, pr.Host, pr.Port);
                if (at < 0) continue;

                string old = pr.Ip;
                pr.Ip = pr.Candidates[at];
                pr.IpIndex = at;
                switched = true;

                SendLog("warn", string.Format(
                    "{0}: на адресе {1} не прошёл ни один вариант — возможно, режется сам адрес. Повторяю перебор на {2}.",
                    pr.Host, old, pr.Ip), "Autotune");
                TuneReport("");
                TuneReport(string.Format("### {0}: адрес {1} не открылся ни при одном варианте, перебор повторяется на {2}",
                    pr.Host, old, pr.Ip));
            }
            return switched;
        }

        /// <summary>Сколько раз проверяется каждая цель.</summary>
        private const int AutotuneAttempts = 3;

        /// <summary>
        /// Сколько вариантов, прошедших быстрый отсев, проверяется полностью
        /// за один заход. Библиотека упорядочена от частых победителей к
        /// редким, так что первые прошедшие — самые вероятные.
        /// </summary>
        private const int AutotuneFinalists = 4;

        private class TuneVariant
        {
            /// <summary>Номер строки в переданном списке — по нему интерфейс узнаёт вариант.</summary>
            public int Index;
            public string Id;
            public string Label;
            public string Args;
        }

        private class VariantResult
        {
            public bool Up;
            public int Passed;
            public int Total;
            public long Ms;
            public string Detail = "";
            /// <summary>Прошла ли страница в настоящем браузере (true, если проверки не было).</summary>
            public bool BrowserOk = true;
            public bool AllOk { get { return Up && Total > 0 && Passed == Total && BrowserOk; } }
        }

        // ---- Проверка в настоящем браузере -------------------------------

        private class BrowserCheck
        {
            public string Url;
            /// <summary>Строка, которая обязана быть в загруженной странице.</summary>
            public string Marker;
        }

        private class BrowserResult
        {
            /// <summary>Проверка состоялась. false — браузера нет или он не запустился.</summary>
            public bool Ran;
            public bool Ok;
            public long Ms;
            public string Detail = "";
        }

        /// <summary>Страницы, которые подбор открывает в браузере у финалистов.</summary>
        private System.Collections.Generic.List<BrowserCheck> tuneBrowserChecks =
            new System.Collections.Generic.List<BrowserCheck>();
        private bool browserMissingReported;

        /// <summary>
        /// Сколько браузер ждёт загрузки страницы. Discord в норме открывается
        /// за 2 с (замер 2026-10-12, страница входа ~76 тыс. символов) —
        /// запас шестикратный.
        /// </summary>
        private const int BrowserCheckTimeoutMs = 12000;

        /// <summary>Путь к Microsoft Edge или null.</summary>
        private static string FindEdge()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"))
                {
                    string v = key != null ? key.GetValue(null) as string : null;
                    if (!string.IsNullOrEmpty(v) && File.Exists(v)) return v;
                }
            }
            catch { }
            foreach (var root in new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) })
            {
                if (string.IsNullOrEmpty(root)) continue;
                string path = Path.Combine(root, @"Microsoft\Edge\Application\msedge.exe");
                if (File.Exists(path)) return path;
            }
            return null;
        }

        /// <summary>
        /// Открывает страницы в Edge без окна и ждёт полной загрузки.
        /// </summary>
        /// <remarks>
        /// Зачем, если есть проба. Проба отвечает на один вопрос — пропустил
        /// ли DPI приветствие, — и смотрит только на ServerHello. Этого мало:
        ///
        /// 1. Подбор 0.4.1 выдал для Discord четыре варианта «9 из 9», а
        ///    вручную поставленный непроверенный вариант давал пустую
        ///    страницу — и человек видел «Discord грузится через раз».
        /// 2. ТСПУ умеет пропускать рукопожатие и замораживать соединение
        ///    после 16–20 КБ ответа (net4people/bbs#490). Проба этого не видит
        ///    в принципе, а клиент Discord на такой заморозке висит на
        ///    заставке.
        /// 3. curl и SslStream шлют маленькое приветствие schannel (TLS 1.2),
        ///    а Discord — большое приветствие Chromium с TLS 1.3; ядро и DPI
        ///    обходятся с ними по-разному (замер 2026-10-12: curl не открыл
        ///    YouTube, Edge открыл его за 3,4 с на той же стратегии).
        ///
        /// Edge — тот же Chromium, что внутри Discord: то же приветствие, тот же
        /// TLS 1.3, загрузка всех подресурсов. Страница считается открытой,
        /// если браузер дождался события load раньше таймаута и в ней есть
        /// ожидаемая строка. Каждый запуск — с чистым профилем, иначе браузер
        /// переиспользовал бы соединения, открытые при прошлом варианте.
        ///
        /// --no-proxy-server: системный прокси (VPN-клиенты вроде Happ) увёл
        /// бы проверку в туннель. --disable-quic: проверяется TCP-профиль
        /// ядра, а не QUIC. Привязать браузер к физической карте, как пробу,
        /// нельзя — при поднятом полнотуннельном VPN проверка соврёт, об этом
        /// предупреждает предполётная проверка.
        /// </remarks>
        private async Task<BrowserResult> RunBrowserChecks(System.Collections.Generic.List<BrowserCheck> checks, TuneVariant v, int count)
        {
            var res = new BrowserResult();
            if (checks == null || checks.Count == 0) return res;

            string edge = FindEdge();
            if (edge == null)
            {
                if (!browserMissingReported)
                {
                    browserMissingReported = true;
                    SendLog("warn", "Microsoft Edge не найден — проверка в браузере пропущена, подбор верит только пробе.", "Autotune");
                }
                return res;
            }

            if (v != null) SendTunePhase(v, count, "browser");

            var sw = Stopwatch.StartNew();
            res.Ok = true;
            foreach (var c in checks)
            {
                if (autotuneCancel) { res.Ok = false; res.Ran = true; res.Detail = "прервано"; break; }
                var one = await Task.Run(() => LoadInEdge(edge, c));
                TuneReport("    браузер: " + c.Url + " — " + one.Detail);
                if (!one.Ran)
                {
                    // Браузер не поднялся вовсе — это не провал варианта.
                    if (!browserMissingReported)
                    {
                        browserMissingReported = true;
                        SendLog("warn", "Edge не запустился (" + one.Detail + ") — проверка в браузере пропущена.", "Autotune");
                    }
                    return new BrowserResult();
                }
                res.Ran = true;
                if (!one.Ok)
                {
                    res.Ok = false;
                    res.Detail = "браузер: " + one.Detail;
                    break;
                }
            }
            res.Ms = sw.ElapsedMilliseconds;
            if (res.Ran && res.Ok) res.Detail = "браузер: открылось за " + res.Ms + " мс";
            return res;
        }

        private BrowserResult LoadInEdge(string edge, BrowserCheck c)
        {
            var r = new BrowserResult();
            string profile = Path.Combine(Path.GetTempPath(), "zapret2-probe-" + Guid.NewGuid().ToString("N"));
            var sw = Stopwatch.StartNew();
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = edge,
                    Arguments = "--headless=new --no-proxy-server --disable-quic --no-first-run --no-default-browser-check " +
                                "--disable-extensions --disable-gpu --disable-sync --disable-background-networking " +
                                "--disable-component-update --mute-audio " +
                                "--user-data-dir=\"" + profile + "\" --timeout=" + BrowserCheckTimeoutMs +
                                " --dump-dom \"" + c.Url + "\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                using (var p = Process.Start(psi))
                {
                    var outTask = p.StandardOutput.ReadToEndAsync();
                    var errTask = p.StandardError.ReadToEndAsync();
                    if (!p.WaitForExit(BrowserCheckTimeoutMs + 8000))
                    {
                        KillProcessTree(p.Id);
                        r.Ran = true;
                        r.Detail = "браузер завис и был снят";
                        return r;
                    }
                    string dom = outTask.Wait(3000) ? outTask.Result : "";
                    long ms = sw.ElapsedMilliseconds;
                    r.Ms = ms;

                    // Пустой вывод за секунду — браузер не стартовал, а не сайт
                    // не открылся: заблокированная страница держит его до таймаута.
                    if (dom.Length == 0 && ms < 1500)
                    {
                        string err = errTask.Wait(1000) ? errTask.Result.Trim() : "";
                        if (err.Length > 120) err = err.Substring(0, 120);
                        r.Detail = "код " + p.ExitCode + (err.Length > 0 ? ", " + err : "");
                        return r;
                    }

                    r.Ran = true;
                    bool marker = dom.IndexOf(c.Marker, StringComparison.OrdinalIgnoreCase) >= 0;
                    bool timedOut = ms >= BrowserCheckTimeoutMs - 300;
                    int secs = BrowserCheckTimeoutMs / 1000;
                    if (marker && dom.Length >= 2000 && !timedOut)
                    {
                        r.Ok = true;
                        r.Detail = "загрузилось за " + ms + " мс, " + dom.Length + " символов";
                    }
                    else if (timedOut && dom.Length >= 2000)
                    {
                        r.Detail = "страница начала грузиться, но не догрузилась за " + secs + " с (" + dom.Length +
                                   " символов) — похоже на заморозку соединения";
                    }
                    else if (timedOut)
                    {
                        r.Detail = "страница не открылась за " + secs + " с";
                    }
                    else
                    {
                        r.Detail = "открылась не та страница (" + dom.Length + " символов, нет «" + c.Marker + "»)";
                    }
                }
            }
            catch (Exception ex)
            {
                r.Detail = "не запустился: " + ex.Message;
            }
            finally
            {
                // Дочерние процессы браузера отпускают профиль не сразу.
                Task.Run(async () =>
                {
                    for (int i = 0; i < 10; i++)
                    {
                        await Task.Delay(1000);
                        try { if (Directory.Exists(profile)) Directory.Delete(profile, true); return; } catch { }
                    }
                });
            }
            return r;
        }

        private static void KillProcessTree(int pid)
        {
            try
            {
                var psi = new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var k = Process.Start(psi)) { if (k != null) k.WaitForExit(5000); }
            }
            catch { }
        }

        /// <summary>
        /// Дополняет полную проверку варианта загрузкой страниц в браузере.
        /// </summary>
        private async Task CheckInBrowser(TuneVariant v, VariantResult r, int count)
        {
            if (!r.AllOk || tuneBrowserChecks.Count == 0 || autotuneCancel) return;
            var b = await RunBrowserChecks(tuneBrowserChecks, v, count);
            if (!b.Ran) return;
            r.BrowserOk = b.Ok;
            r.Detail = r.Detail.Length > 0 ? r.Detail + "; " + b.Detail : b.Detail;
            SendLog(b.Ok ? "success" : "warn", string.Format("[{0}] {1}", v.Label, b.Detail), "Autotune");
        }

        private enum RoundOutcome
        {
            /// <summary>Есть вариант, прошедший полную проверку.</summary>
            Winner,
            /// <summary>Цели открываются без обхода — перебирать нечего.</summary>
            NotNeeded,
            Cancelled,
            /// <summary>Проверены все варианты, победителя нет.</summary>
            Exhausted
        }

        /// <summary>
        /// Поднимает ядро с вариантом и проверяет цели, по attempts попыток на
        /// каждую. Результат в интерфейс не отправляет — это решает вызывающий:
        /// прошедший отсев вариант ещё не итог.
        /// </summary>
        private async Task<VariantResult> TestVariant(TuneVariant v, System.Collections.Generic.List<TuneProbe> probes,
            int count, int attempts, string stage)
        {
            var res = new VariantResult();
            bool isOff = v.Id == "off";

            SendTunePhase(v, count, "starting");
            StopZapretProcess(false);

            // Эталон гоняется с полностью остановленным ядром, а не
            // с отключённым профилем: вопрос «а блокируют ли вообще»
            // должен проверяться так, как будто программы нет.
            res.Up = isOff ? true : StartCoreForTune(v.Args);
            res.Total = probes.Count * attempts;
            if (!res.Up)
            {
                SendLog("error", string.Format("[{0}] ядро не запустилось — вариант пропущен.", v.Label), "Autotune");
                res.Detail = "ядро не запустилось";
                return res;
            }

            // Драйвер уже загружен (StartZapretProcess ждал 1,5 с),
            // но conntrack ядра пуст — даём ему полсекунды.
            await Task.Delay(600);

            SendTunePhase(v, count, "testing");

            TuneReport("");
            TuneReport(string.Format("=== [{0}] {1} ({2})", v.Id, v.Label, stage));
            TuneReport(isOff ? "    ядро остановлено" : "    winws " + v.Args);

            var weak = new System.Collections.Generic.List<string>();
            var sw = Stopwatch.StartNew();

            for (int t = 0; t < probes.Count; t++)
            {
                if (autotuneCancel) break;
                var pr = probes[t];
                int ok = await ProbeTarget(pr, attempts);
                res.Passed += ok;
                // Эталон не в счёт: без обхода цель и должна молчать.
                if (!isOff)
                {
                    pr.Tested = true;
                    if (ok > 0) pr.EverPassed = true;
                }
                if (ok < attempts) weak.Add(pr.Host + ": " + ok + " из " + attempts);

                // Цель не открылась ни разу — вариант не годится, и
                // остальные цели проверять незачем. Все они нужны
                // одновременно: клиент Discord без discord.com
                // застревает на заставке, как бы ни работал шлюз.
                // Эталон тоже обрывается: одной закрытой цели достаточно,
                // чтобы понять, что блокировка есть.
                if (ok == 0 && t + 1 < probes.Count)
                {
                    for (int r = t + 1; r < probes.Count; r++)
                    {
                        weak.Add(probes[r].Host + ": не проверялась");
                    }
                    TuneReport("    остальные цели не проверялись: " + pr.Host + " не открылся ни разу");
                    break;
                }
            }
            sw.Stop();
            res.Ms = sw.ElapsedMilliseconds;
            res.Detail = weak.Count > 0 ? string.Join("; ", weak.ToArray()) : "";

            bool coreAlive;
            lock (procLock) { coreAlive = winws != null && !winws.HasExited; }
            TuneReport(string.Format("    итог: {0} из {1}{2}", res.Passed, res.Total,
                isOff ? "" : coreAlive ? ", ядро живо" : ", ЯДРО УМЕРЛО во время проверки"));

            SendLog(res.AllOk ? "success" : res.Passed > 0 ? "warn" : "error",
                string.Format("[{0}] {1}: успешных проб {2} из {3} за {4} мс{5}",
                    v.Label, stage, res.Passed, res.Total, res.Ms,
                    res.Detail.Length > 0 ? " (" + res.Detail + ")" : ""),
                "Autotune");
            return res;
        }

        private void SendTuneResult(TuneVariant v, VariantResult r)
        {
            SendTuneEvent(string.Format(
                "{{\"type\":\"autotune_result\",\"index\":{0},\"id\":\"{1}\",\"ok\":{2},\"passed\":{3},\"total\":{4},\"ms\":{5},\"detail\":\"{6}\"}}",
                v.Index, JsonEscape(v.Id), r.AllOk ? "true" : "false", r.Passed, r.Total, r.Ms,
                JsonEscape(r.Detail)));
        }

        private void SendTunePhase(TuneVariant v, int count, string phase)
        {
            SendTuneEvent(string.Format(
                "{{\"type\":\"autotune_step\",\"index\":{0},\"total\":{1},\"id\":\"{2}\",\"phase\":\"{3}\"}}",
                v.Index, count, JsonEscape(v.Id), phase));
        }

        /// <summary>
        /// Один круг перебора в два этапа: быстрый отсев и полная проверка.
        /// </summary>
        /// <remarks>
        /// Полная проверка — три попытки на цель — на двадцати вариантах шла
        /// бы минут восемь. Поэтому сначала каждый вариант получает одну
        /// попытку на цель: заблокированный отсеивается на первой же закрытой
        /// цели, и это почти всё время подбора. Прошедшие отсев проверяются
        /// полностью: одна удачная попытка ничего не доказывает, многие DPI
        /// пропускают первое соединение и режут следующие.
        ///
        /// Отсев останавливается, когда набралось AutotuneFinalists кандидатов.
        /// Если ни один не выдержал полной проверки, отсев продолжается с того
        /// места, где остановился: иначе «пропускает первое соединение» могло
        /// бы спрятать рабочий вариант в хвосте списка.
        ///
        /// Эталон («off») проверяется сразу полностью: от него зависит, нужен
        /// ли перебор вообще, и ошибиться здесь дороже всего.
        /// </remarks>
        private async Task<RoundOutcome> RunTuneRound(System.Collections.Generic.List<TuneVariant> plan,
            System.Collections.Generic.List<TuneProbe> probes, int count)
        {
            int next = 0;
            while (next < plan.Count)
            {
                var finalists = new System.Collections.Generic.List<TuneVariant>();

                // --- Отсев ---
                for (; next < plan.Count && finalists.Count < AutotuneFinalists; next++)
                {
                    if (autotuneCancel) { SendLog("warn", "Автоподбор прерван.", "Autotune"); return RoundOutcome.Cancelled; }
                    var v = plan[next];

                    if (v.Id == "off")
                    {
                        var b = await TestVariant(v, probes, count, AutotuneAttempts, "эталон");
                        // Рукопожатие без обхода проходит — но это ещё не «обход
                        // не нужен»: ТСПУ может пропускать приветствие и
                        // замораживать соединение после первых 16–20 КБ.
                        await CheckInBrowser(v, b, count);
                        if (!b.BrowserOk)
                            SendLog("warn", "Без обхода рукопожатие проходит, а страница в браузере не грузится — блокировка есть, перебираю стратегии.", "Autotune");
                        SendTuneResult(v, b);
                        // Эталон прошёл полностью — блокировки нет, и перебор
                        // стратегий ничего не даст. Говорим об этом прямо.
                        if (b.AllOk && !autotuneCancel)
                        {
                            SendLog("success",
                                "Цели открываются и без обхода — блокировки не видно. Перебор стратегий прекращён. " +
                                "Если приложение всё равно не работает, дело не в DPI: проверьте VPN, прокси и кэш самого приложения.",
                                "Autotune");
                            return RoundOutcome.NotNeeded;
                        }
                        continue;
                    }

                    var r = await TestVariant(v, probes, count, 1, "отсев");
                    if (autotuneCancel) continue;
                    if (r.AllOk)
                    {
                        finalists.Add(v);
                        SendTunePhase(v, count, "finalist");
                    }
                    else
                    {
                        SendTuneResult(v, r);
                    }
                }

                // --- Полная проверка ---
                bool winner = false;
                foreach (var v in finalists)
                {
                    if (autotuneCancel) { SendLog("warn", "Автоподбор прерван.", "Autotune"); return RoundOutcome.Cancelled; }
                    var r = await TestVariant(v, probes, count, AutotuneAttempts, "полная проверка");
                    await CheckInBrowser(v, r, count);
                    SendTuneResult(v, r);
                    if (r.AllOk) winner = true;
                }

                if (winner)
                {
                    // Остальные варианты не понадобились — помечаем их, чтобы
                    // таблица не висела «в очереди».
                    for (int k = next; k < plan.Count; k++) SendTunePhase(plan[k], count, "skipped");
                    return RoundOutcome.Winner;
                }
                if (autotuneCancel) { SendLog("warn", "Автоподбор прерван.", "Autotune"); return RoundOutcome.Cancelled; }
                if (next < plan.Count && finalists.Count > 0)
                    SendLog("info", "Ни один кандидат не выдержал полной проверки — продолжаю отсев.", "Autotune");
            }
            return RoundOutcome.Exhausted;
        }

        private void RunAutotune(string payload)
        {
            if (autotuneRunning)
            {
                SendLog("warn", "Автоподбор уже идёт.", "Autotune");
                return;
            }

            LogProbeBinding("Autotune");

            // payload: <restoreArgs> \x1f <host1,host2> \x1f id|label|args \x1e id|label|args ...
            string[] head = payload.Split('\x1f');
            if (head.Length < 3)
            {
                SendLog("error", "Некорректные данные для автоподбора.", "Autotune");
                return;
            }

            string restoreArgs = head[0];
            string[] hosts = head[1].Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            string[] rawVariants = head[2].Split(new[] { '\x1e' }, StringSplitOptions.RemoveEmptyEntries);

            // Четвёртое поле (с 0.4.2): страницы для проверки в браузере,
            // «адрес|ожидаемая строка» через \x1e.
            tuneBrowserChecks = new System.Collections.Generic.List<BrowserCheck>();
            if (head.Length >= 4)
            {
                foreach (var item in head[3].Split(new[] { '\x1e' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    int bar = item.LastIndexOf('|');
                    if (bar <= 0) continue;
                    string url = item.Substring(0, bar);
                    if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) continue;
                    tuneBrowserChecks.Add(new BrowserCheck { Url = url, Marker = item.Substring(bar + 1) });
                }
            }
            browserMissingReported = false;

            // Эталон («обход выключен») идёт первым, а не седьмой строкой в
            // списке. Его результат меняет смысл всего остального: если цели
            // открываются и без обхода, перебирать стратегии незачем, а если
            // не открываются — понятно, что именно мы пытаемся починить.
            rawVariants = MoveBaselineFirst(rawVariants);

            autotuneRunning = true;
            autotuneCancel = false;
            tuneTraces.Clear();
            lock (tuneReportLock)
            {
                tuneReport = new StringBuilder();
                tuneReport.Append("Автоподбор, ").Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"))
                    .Append(", версия ").Append(AppVersion).Append("\r\n");
                tuneReport.Append("Цели: ").Append(head[1]).Append("\r\n");
                if (tuneBrowserChecks.Count > 0)
                {
                    tuneReport.Append("Проверка в браузере у финалистов: ");
                    foreach (var c in tuneBrowserChecks) tuneReport.Append(c.Url).Append(' ');
                    tuneReport.Append("\r\n");
                }
                tuneReport.Append("Строки ядра о пробах видны только с --debug: без него счётчики ядра будут нулевыми.\r\n");
            }
            IPAddress probeBind = FindPhysicalLocalAddress();
            TuneReport("Пробы привязаны к: " + (probeBind != null ? probeBind.ToString() : "НЕ ПРИВЯЗАНЫ"));
            TuneReport("Проба: приветствие " + ChromeHello.Origin + ", " + ChromeHello.TemplateSize +
                " байт; успех — ServerHello с нашим номером сессии.");

            Task.Run(async () =>
            {
                var probes = new System.Collections.Generic.List<TuneProbe>();
                try
                {
                    SendLog("info", "Автоподбор стратегии запущен.", "Autotune");

                    // --- Резолвим цели один раз ---------------------------
                    foreach (var h in hosts)
                    {
                        string host = h.Trim();
                        if (host.Length == 0) continue;
                        // «имя:порт» — цель не на 443 (медиасерверы Discord).
                        int port = 443;
                        int colon = host.LastIndexOf(':');
                        if (colon > 0)
                        {
                            int parsed;
                            if (int.TryParse(host.Substring(colon + 1), out parsed) && parsed > 0 && parsed < 65536) port = parsed;
                            host = host.Substring(0, colon);
                        }
                        try
                        {
                            var addrs = Dns.GetHostAddresses(host);
                            var candidates = new System.Collections.Generic.List<string>();
                            foreach (var a in addrs)
                            {
                                if (a.AddressFamily == AddressFamily.InterNetwork) candidates.Add(a.ToString());
                            }
                            if (candidates.Count == 0)
                            {
                                SendLog("error", "DNS не вернул IPv4 для " + host + " — проверка невозможна.", "Autotune");
                                continue;
                            }

                            // Берём не первый адрес, а первый ОТВЕЧАЮЩИЙ.
                            //
                            // Раньше брался первый из списка и на нём висел весь
                            // перебор. У discord.com из пяти адресов один не
                            // отвечал вовсе, DNS вернул именно его — и все восемь
                            // вариантов, включая эталон, честно бились в стену.
                            // Итог гласил «ни с обходом, ни без него», хотя
                            // соседние адреса отвечали за 12 мс.
                            //
                            // Браузер в такой ситуации просто идёт к следующему
                            // адресу. Проверка обязана вести себя так же, иначе
                            // она меряет доступность одного адреса, а не блокировку.
                            int at = PickReachable(candidates, 0, host, port);
                            if (at < 0)
                            {
                                SendLog("error",
                                    "Ни один адрес " + host + " не отвечает на порт " + port + " (" +
                                    string.Join(", ", candidates.ToArray()) + "). " +
                                    "Это не похоже на блокировку по имени сайта: соединение не устанавливается вовсе. " +
                                    "Цель исключена из проверки.", "Autotune");
                                continue;
                            }

                            string ip = candidates[at];
                            probes.Add(new TuneProbe { Host = host, Ip = ip, Port = port, Candidates = candidates, IpIndex = at });
                            SendLog("info", string.Format("Цель {0} -> {1}{2}", port == 443 ? host : host + ":" + port, ip,
                                candidates.Count > 1 ? " (из " + candidates.Count + " адресов)" : ""), "Autotune");
                        }
                        catch (Exception ex)
                        {
                            SendLog("error", "DNS для " + host + ": " + ex.Message, "Autotune");
                        }
                    }

                    if (probes.Count == 0)
                    {
                        SendLog("error", "Не удалось определить ни одного адреса. Автоподбор отменён.", "Autotune");
                        return;
                    }

                    // --- Перебор ------------------------------------------
                    var plan = new System.Collections.Generic.List<TuneVariant>();
                    for (int i = 0; i < rawVariants.Length; i++)
                    {
                        string[] parts = rawVariants[i].Split(new[] { '|' }, 3);
                        if (parts.Length < 3) continue;
                        plan.Add(new TuneVariant { Index = i, Id = parts[0], Label = parts[1], Args = parts[2] });
                    }

                    for (int round = 0; ; round++)
                    {
                        foreach (var pr in probes) { pr.Tested = false; pr.EverPassed = false; }

                        var outcome = await RunTuneRound(plan, probes, rawVariants.Length);
                        if (outcome != RoundOutcome.Exhausted) break;

                        // Круг закончился без победителя. Если какая-то цель не
                        // открылась ни при одном варианте, виноват может быть
                        // сам адрес, а не стратегии: у Discord на ДомРу адрес
                        // 162.159.137.232 принимал TCP, но молчал на ClientHello
                        // при любом обходе, а соседние адреса открывались.
                        // Меняем такой цели адрес и проходим варианты заново.
                        if (autotuneCancel || round >= AutotuneAddressRetries) break;
                        if (!SwitchStuckProbes(probes)) break;
                        // Интерфейс сбрасывает таблицу в очередь: иначе
                        // второй круг пишет поверх готовых строк, а
                        // прогресс мастера стоит на 100%.
                        SendTuneEvent(string.Format(
                            "{{\"type\":\"autotune_round\",\"round\":{0}}}", round + 1));
                    }
                }
                catch (Exception ex)
                {
                    SendLog("error", "Автоподбор прерван ошибкой: " + ex.Message, "Autotune");
                }
                finally
                {
                    // Возвращаем ядро в исходное состояние, чтобы автоподбор
                    // не оставлял систему со случайным вариантом.
                    StopZapretProcess(false);
                    autotuneRunning = false;
                    tuneTraces.Clear();
                    SaveTuneReport();

                    if (!string.IsNullOrEmpty(restoreArgs))
                    {
                        SendLog("info", "Возвращаю ядро к активной стратегии.", "Autotune");
                        StartZapretProcess(restoreArgs);
                    }
                    else
                    {
                        SendStatus("disconnected", 0);
                    }

                    SendLog("success", "Автоподбор завершён.", "Autotune");
                    SendTuneEvent("{\"type\":\"autotune_done\"}");
                }
            });
        }

        private void SendDiagnosticStep(string targetId, int stepIndex, string status, string detail, int latency)
        {
            string safeDetail = detail.Replace("\\", "\\\\").Replace("\"", "\\\"");
            string json = string.Format("{{\"type\":\"diag_step\",\"targetId\":\"{0}\",\"stepIndex\":{1},\"status\":\"{2}\",\"detail\":\"{3}\",\"latencyMs\":{4}}}",
                targetId, stepIndex, status, safeDetail, latency);
            SendToWeb(json);
        }

        // ---- Прокси Telegram ---------------------------------------------

        /// <summary>
        /// Поднять мост. Параметры приходят строкой host|port|secret|tcp|front —
        /// разбирать ради пяти полей полноценный JSON смысла нет.
        /// </summary>
        private void StartTgProxy(string payload)
        {
            string[] p = payload.Split('|');
            if (p.Length < 5)
            {
                tgLastError = "неполные параметры запуска";
                SendTgStatus();
                return;
            }

            string host = p[0] == "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
            int port;
            if (!int.TryParse(p[1], out port)) port = TgProxyServer.DefaultPort;
            string secretHex = p[2];
            bool allowTcp = p[3] == "1";
            bool allowFront = p[4] == "1";
            // Шестое поле добавилось позже: старая сохранённая строка без него
            // не должна ронять запуск, поэтому по умолчанию включено.
            bool allowCf = p.Length < 6 || p[5] == "1";

            try
            {
                if (tgProxy == null)
                {
                    tgProxy = new TgProxyServer((level, message) => SendLog(level, message, "TgProxy"));
                }
                tgProxy.AllowDirectTcp = allowTcp;
                tgProxy.AllowFronting = allowFront;
                tgProxy.AllowCloudflare = allowCf;
                tgProxy.Start(host, port, secretHex);
                tgLastError = "";

                if (tgStatusTimer == null)
                {
                    tgStatusTimer = new System.Windows.Forms.Timer();
                    tgStatusTimer.Interval = 2000;
                    tgStatusTimer.Tick += (s, e) => SendTgStatus();
                }
                tgStatusTimer.Start();
            }
            catch (Exception ex)
            {
                tgLastError = ex.Message;
                SendLog("error", "Прокси Telegram не запустился: " + ex.Message, "TgProxy");
            }
            SendTgStatus();
        }

        private void StopTgProxy()
        {
            try { if (tgStatusTimer != null) tgStatusTimer.Stop(); } catch { }
            try { if (tgProxy != null) tgProxy.Stop(); } catch { }
            tgLastError = "";
            SendTgStatus();
        }

        /// <summary>
        /// Адрес, который надо писать в ссылку.
        /// </summary>
        /// <remarks>
        /// При работе только на localhost это 127.0.0.1. Если слушатель открыт
        /// в локальную сеть, в ссылке должен стоять адрес этой машины в сети —
        /// иначе телефон по такой ссылке придёт сам к себе.
        /// </remarks>
        private string TgLinkHost()
        {
            if (tgProxy == null || tgProxy.BindHost != "0.0.0.0") return "127.0.0.1";
            try
            {
                IPAddress local = FindPhysicalLocalAddress();
                if (local != null) return local.ToString();
            }
            catch { }
            return "127.0.0.1";
        }

        private void SendTgStatus()
        {
            bool running = tgProxy != null && tgProxy.IsRunning;
            var st = tgProxy != null ? tgProxy.Snapshot() : new TgProxyStats();
            string err = (tgLastError ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");

            string json = string.Format(
                "{{\"type\":\"tg_status\",\"running\":{0},\"host\":\"{1}\",\"port\":{2},\"linkHost\":\"{3}\",\"error\":\"{4}\"," +
                "\"stats\":{{\"total\":{5},\"active\":{6},\"bad\":{7},\"ws\":{8},\"cf\":{9},\"tcp\":{10},\"failed\":{11},\"bytesUp\":{12},\"bytesDown\":{13}}}}}",
                running ? "true" : "false",
                tgProxy != null ? tgProxy.BindHost : "127.0.0.1",
                tgProxy != null ? tgProxy.BindPort : TgProxyServer.DefaultPort,
                TgLinkHost(),
                err,
                st.Total, st.Active, st.Bad, st.ViaWs, st.ViaCf, st.ViaTcp, st.Failed, st.BytesUp, st.BytesDown);
            SendToWeb(json);
        }

        /// <summary>
        /// Отдать ссылку tg://proxy системе — её подхватит установленный клиент.
        /// </summary>
        /// <remarks>
        /// Строка приходит из веб-слоя, поэтому проверяется дважды: и префикс,
        /// и набор символов. Через оболочку уходит только то, что заведомо
        /// является ссылкой на прокси, а не путём к программе.
        /// </remarks>
        private void OpenTgLink(string link)
        {
            if (link == null) return;
            link = link.Trim();
            if (!link.StartsWith("tg://proxy?", StringComparison.Ordinal)) return;
            if (link.Length > 512) return;
            foreach (char c in link)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                    || c == ':' || c == '/' || c == '?' || c == '&' || c == '=' || c == '.' || c == '-' || c == '_';
                if (!ok) return;
            }
            try { Process.Start(new ProcessStartInfo(link) { UseShellExecute = true }); }
            catch (Exception ex)
            {
                SendLog("error", "Не удалось открыть ссылку в Telegram: " + ex.Message, "TgProxy");
            }
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
                    else if (rawMsg.StartsWith("save_settings:"))
                    {
                        SaveSettingsJson(rawMsg.Substring("save_settings:".Length));
                    }
                    else if (rawMsg == "discord_scan")
                    {
                        SendDiscordScan();
                    }
                    else if (rawMsg.StartsWith("discord_clean:"))
                    {
                        CleanDiscordCache(rawMsg.Substring("discord_clean:".Length));
                    }
                    else if (rawMsg == "run_diagnostics")
                    {
                        RunRealDiagnostics();
                    }
                    else if (rawMsg == "run_preflight")
                    {
                        SendPreflight();
                    }
                    else if (rawMsg == "kill_stale_winws")
                    {
                        KillStaleWinws();
                    }
                    else if (rawMsg == "enable_tcp_timestamps")
                    {
                        Task.Run(() => EnableTcpTimestamps());
                    }
                    else if (rawMsg == "lists_info")
                    {
                        Task.Run(() => SendListsInfo("", ""));
                    }
                    else if (rawMsg == "lists_check:manual" || rawMsg == "lists_check:auto")
                    {
                        CheckListsUpdate(rawMsg.EndsWith("manual"));
                    }
                    else if (rawMsg == "lists_reset")
                    {
                        ResetListsToBuiltin();
                    }
                    else if (rawMsg == "autostart_get")
                    {
                        Task.Run(() => SendAutostartState(""));
                    }
                    else if (rawMsg == "autostart_set:1" || rawMsg == "autostart_set:0")
                    {
                        SetAutostart(rawMsg.EndsWith("1"));
                    }
                    else if (rawMsg == "autotune_cancel")
                    {
                        autotuneCancel = true;
                    }
                    else if (rawMsg.StartsWith("download_update:"))
                    {
                        DownloadAndApplyUpdate(rawMsg.Substring("download_update:".Length));
                    }
                    else if (rawMsg.StartsWith("autotune:"))
                    {
                        RunAutotune(rawMsg.Substring("autotune:".Length));
                    }
                    else if (rawMsg.StartsWith("tg_start:"))
                    {
                        StartTgProxy(rawMsg.Substring("tg_start:".Length));
                    }
                    else if (rawMsg == "tg_stop")
                    {
                        StopTgProxy();
                    }
                    else if (rawMsg == "tg_status")
                    {
                        SendTgStatus();
                    }
                    else if (rawMsg.StartsWith("tg_open:"))
                    {
                        OpenTgLink(rawMsg.Substring("tg_open:".Length));
                    }
                    else if (rawMsg == "close")
                    {
                        isExiting = true;
                        // WebView2 закрываем явно: иначе движок убивают вместе
                        // с процессом, и его отложенные записи на диск
                        // пропадают. Настройки мы теперь храним сами, но
                        // терять чужие данные молча всё равно неправильно.
                        try { if (webView != null) webView.Dispose(); } catch { }
                        // Сессии прокси закрываются явно, а не вместе с
                        // процессом: клиент Telegram получает нормальный
                        // разрыв и переподключается сразу, а не по таймауту.
                        try { if (tgStatusTimer != null) tgStatusTimer.Stop(); } catch { }
                        try { if (tgProxy != null) tgProxy.Stop(); } catch { }
                        StopZapretProcess();
                        KillZombieWinDivert();
                        TryStopWinDivertService();
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

        /// <summary>
        /// Занять место единственного экземпляра. false — программа уже
        /// запущена: её окно попрошено показаться, этой копии надо выйти.
        /// </summary>
        private static bool AcquireSingleInstance()
        {
            try
            {
                bool createdNew;
                instanceMutex = new Mutex(true, InstanceMutexName, out createdNew);
                if (createdNew)
                {
                    instanceShowEvent = new EventWaitHandle(false, EventResetMode.AutoReset, InstanceShowEventName);
                    return true;
                }

                instanceMutex.Dispose();
                instanceMutex = null;
                try
                {
                    // Эту копию запустил человек только что — у неё есть право
                    // вывести окно на передний план. Передаём его первой копии,
                    // иначе Windows покажет её окно мигающей кнопкой на панели
                    // задач, а не поверх остальных.
                    AllowSetForegroundWindow(-1);
                    using (var ev = EventWaitHandle.OpenExisting(InstanceShowEventName))
                    {
                        ev.Set();
                    }
                }
                catch { }
                return false;
            }
            catch
            {
                // Не смогли даже проверить — запускаемся как обычно: лучше
                // вторая копия, чем программа, которая не открывается вовсе.
                return true;
            }
        }

        private static void ReleaseSingleInstance()
        {
            try { if (instanceShowEvent != null) instanceShowEvent.Dispose(); } catch { }
            instanceShowEvent = null;
            try
            {
                if (instanceMutex != null)
                {
                    instanceMutex.ReleaseMutex();
                    instanceMutex.Dispose();
                }
            }
            catch { }
            instanceMutex = null;
        }

        /// <summary>Ждёт сигнала от повторного запуска и показывает окно.</summary>
        private void StartInstanceListener()
        {
            if (instanceShowEvent == null || instanceListenerStarted) return;
            instanceListenerStarted = true;
            var t = new Thread(delegate()
            {
                while (!isExiting)
                {
                    try
                    {
                        if (!instanceShowEvent.WaitOne(1000)) continue;
                        if (isExiting || !this.IsHandleCreated) break;
                        this.BeginInvoke(new Action(() =>
                        {
                            WriteLogFile("info", "Setup", "Повторный запуск — показываю уже открытое окно.");
                            RestoreWindow();
                        }));
                    }
                    catch { break; }
                }
            });
            t.IsBackground = true;
            t.Name = "single-instance";
            t.Start();
        }

        // ================= Обновление списков сайтов ===========================
        //
        // Списки вшиты в exe и раньше обновлялись только с новой версией
        // программы. Теперь программа берёт их из репозитория — из host-list/
        // ветки main: там же лежит lists.json с номером версии и SHA-256
        // каждого файла (его пишет scripts/lists_manifest.mjs, сборка
        // запускает его сама). Опубликовать списки = запушить их в main.
        //
        // Скачанное хранится отдельно, в host-list-update\: встроенные списки
        // распаковываются в host-list\ при каждом запуске и затёрли бы его.
        // После распаковки обновление кладётся поверх — если оно новее
        // встроенного. Когда выходит программа со списками ещё свежее,
        // скачанное удаляется.
        //
        // Ядро перечитывает списки само, как только у файла меняются время
        // изменения или размер (nfq/hostlist.c, LoadHostList), поэтому после
        // обновления его не перезапускаем. Файлы надо только подменять
        // целиком, а не переписывать на месте.

        private const string ListsBaseUrl = "https://raw.githubusercontent.com/snax1k/new-zapret2-gui/main/host-list/";
        private const string ListsManifestName = "lists.json";
        /// <summary>Только эти файлы обновляются из сети — имя из манифеста иначе в путь не попадает.</summary>
        private static readonly string[] UpdatableLists = { "list-general.txt", "list-google.txt", "list-exclude.txt" };
        private const int LIST_MAX_BYTES = 4 * 1024 * 1024;
        private volatile bool listsBusy = false;

        private string ListsUpdateDir
        {
            get { return Path.Combine(Path.GetDirectoryName(listsPath), "host-list-update"); }
        }

        private class ListsManifest
        {
            public int Version;
            public string Updated = "";
            public System.Collections.Generic.Dictionary<string, string> Sha =
                new System.Collections.Generic.Dictionary<string, string>(StringComparer.Ordinal);
        }

        /// <summary>Разбор lists.json. Формат наш (lists_manifest.mjs), регулярных выражений хватает.</summary>
        private static ListsManifest ParseListsManifest(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            var v = Regex.Match(json, "\"version\"\\s*:\\s*(\\d+)");
            if (!v.Success) return null;
            var m = new ListsManifest();
            m.Version = int.Parse(v.Groups[1].Value);
            var u = Regex.Match(json, "\"updated\"\\s*:\\s*\"([^\"]*)\"");
            if (u.Success) m.Updated = u.Groups[1].Value;
            foreach (Match f in Regex.Matches(json,
                "\"name\"\\s*:\\s*\"([^\"]+)\"\\s*,\\s*\"sha256\"\\s*:\\s*\"([0-9a-fA-F]{64})\""))
            {
                if (Array.IndexOf(UpdatableLists, f.Groups[1].Value) >= 0)
                    m.Sha[f.Groups[1].Value] = f.Groups[2].Value.ToLowerInvariant();
            }
            return m;
        }

        private static ListsManifest ReadListsManifest(string dir)
        {
            try
            {
                string p = Path.Combine(dir, ListsManifestName);
                return File.Exists(p) ? ParseListsManifest(File.ReadAllText(p, Encoding.UTF8)) : null;
            }
            catch { return null; }
        }

        private static string Sha256Hex(byte[] data)
        {
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                var sb = new StringBuilder(64);
                foreach (byte b in sha.ComputeHash(data)) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>Записей в списке: непустые строки, кроме комментариев.</summary>
        private static int CountHostlistEntries(string text)
        {
            int n = 0;
            foreach (string raw in text.Split('\n'))
            {
                string s = raw.Trim();
                if (s.Length > 0 && s[0] != '#') n++;
            }
            return n;
        }

        /// <summary>
        /// Похоже ли на список доменов zapret: имена (допустимы ^ в начале и *),
        /// комментарии с #. Чтобы вместо списка не легла страница с ошибкой.
        /// </summary>
        private static bool LooksLikeHostlist(string text)
        {
            int n = 0;
            foreach (string raw in text.Split('\n'))
            {
                string s = raw.Trim();
                if (s.Length == 0 || s[0] == '#') continue;
                if (s.Length > 260 || !Regex.IsMatch(s, "^\\^?[A-Za-z0-9*._-]+$")) return false;
                n++;
            }
            return n > 0;
        }

        /// <summary>Подменяет файл целиком: ядро не должно прочитать его наполовину.</summary>
        private static void ReplaceFileAtomically(string target, byte[] data)
        {
            string tmp = target + ".tmp";
            File.WriteAllBytes(tmp, data);
            for (int i = 0; ; i++)
            {
                try
                {
                    if (File.Exists(target)) File.Replace(tmp, target, null, true);
                    else File.Move(tmp, target);
                    return;
                }
                catch (IOException)
                {
                    // Ядро могло как раз читать файл.
                    if (i >= 5) { try { File.Delete(tmp); } catch { } throw; }
                    Thread.Sleep(200);
                }
            }
        }

        /// <summary>
        /// При запуске, после распаковки встроенных списков: скачанные новее —
        /// кладём поверх; устарели (вышла программа со списками свежее) или
        /// испорчены — удаляем.
        /// </summary>
        private void ApplyListsOverlay()
        {
            string dir = ListsUpdateDir;
            if (!Directory.Exists(dir)) return;
            try
            {
                var upd = ReadListsManifest(dir);
                var builtin = ReadListsManifest(listsPath);
                int builtinVer = builtin != null ? builtin.Version : 0;
                if (upd == null || upd.Version <= builtinVer)
                {
                    Directory.Delete(dir, true);
                    if (upd != null)
                        WriteLogFile("info", "Lists", string.Format(
                            "Встроенные списки (версия {0}) не старее скачанных ({1}) — скачанные удалены.", builtinVer, upd.Version));
                    return;
                }

                // Сначала проверяем все файлы, потом подменяем: полуприменённое
                // обновление хуже никакого.
                var files = new System.Collections.Generic.Dictionary<string, byte[]>();
                foreach (var kv in upd.Sha)
                {
                    byte[] data = File.ReadAllBytes(Path.Combine(dir, kv.Key));
                    if (Sha256Hex(data) != kv.Value) throw new InvalidDataException(kv.Key + ": контрольная сумма не сходится");
                    files[kv.Key] = data;
                }
                foreach (var kv in files) ReplaceFileAtomically(Path.Combine(listsPath, kv.Key), kv.Value);
                WriteLogFile("info", "Lists", string.Format(
                    "Списки сайтов: скачанная версия {0} от {1} (встроенная — {2}).", upd.Version, upd.Updated, builtinVer));
            }
            catch (Exception ex)
            {
                WriteLogFile("warn", "Lists", "Скачанные списки не применены и удалены: " + ex.Message);
                try { Directory.Delete(dir, true); } catch { }
                try { RestoreBuiltinLists(); } catch { }
            }
        }

        /// <summary>Встроенные в exe списки — обратно в host-list\, с атомарной подменой.</summary>
        private void RestoreBuiltinLists()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("lists.zip"))
            {
                if (stream == null) return;
                using (var archive = new ZipArchive(stream))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        if (Array.IndexOf(UpdatableLists, entry.Name) < 0) continue;
                        using (var s = entry.Open())
                        using (var ms = new MemoryStream())
                        {
                            s.CopyTo(ms);
                            ReplaceFileAtomically(Path.Combine(listsPath, entry.Name), ms.ToArray());
                        }
                    }
                }
            }
        }

        /// <summary>Состояние списков — в интерфейс. result: updated, up_to_date, reset, error или пусто.</summary>
        private void SendListsInfo(string result, string error)
        {
            var builtin = ReadListsManifest(listsPath);
            var upd = ReadListsManifest(ListsUpdateDir);
            bool fromUpdate = upd != null && (builtin == null || upd.Version > builtin.Version);
            var cur = fromUpdate ? upd : builtin;
            int domains = 0;
            foreach (string name in new[] { "list-general.txt", "list-google.txt" })
            {
                try { domains += CountHostlistEntries(File.ReadAllText(Path.Combine(listsPath, name), Encoding.UTF8)); }
                catch { }
            }
            SendToWeb(string.Format(
                "{{\"type\":\"lists_info\",\"version\":{0},\"updated\":\"{1}\",\"source\":\"{2}\",\"builtinVersion\":{3},\"domains\":{4},\"result\":\"{5}\",\"error\":\"{6}\"}}",
                cur != null ? cur.Version : 0, JsonEscape(cur != null ? cur.Updated : ""),
                fromUpdate ? "update" : "builtin", builtin != null ? builtin.Version : 0,
                domains, result, JsonEscape(error ?? "")));
        }

        /// <summary>
        /// Откуда брать списки. Основной — raw.githubusercontent.com; у
        /// некоторых провайдеров он недоступен, тогда — тот же репозиторий
        /// через CDN jsDelivr (кэширует ветку до 12 часов — обновление придёт
        /// позже, но придёт).
        /// </summary>
        private static readonly string[] ListsSources =
        {
            ListsBaseUrl,
            "https://cdn.jsdelivr.net/gh/snax1k/new-zapret2-gui@main/host-list/"
        };

        /// <summary>
        /// Описание и, если версия новее current, файлы из одного источника.
        /// null — новее нет. Исключение — источник недоступен или отдал не то.
        /// </summary>
        private static System.Collections.Generic.Dictionary<string, byte[]> FetchRemoteLists(
            string baseUrl, int current, out ListsManifest remote, out string remoteJson)
        {
            // raw.githubusercontent.com держит файлы в кэше несколько минут —
            // метка в адресе просит свежую копию.
            string stamp = "?t=" + DateTime.UtcNow.Ticks;
            using (var wc = new WebClient())
            {
                wc.Encoding = Encoding.UTF8;
                wc.Headers.Add("User-Agent", "Zapret2-GUI/" + AppVersion);
                remoteJson = wc.DownloadString(baseUrl + ListsManifestName + stamp);
                remote = ParseListsManifest(remoteJson);
                if (remote == null || remote.Sha.Count == 0)
                    throw new InvalidDataException("в репозитории нет описания списков (lists.json)");
                if (remote.Version <= current) return null;

                var files = new System.Collections.Generic.Dictionary<string, byte[]>();
                foreach (var kv in remote.Sha)
                {
                    byte[] data = wc.DownloadData(baseUrl + kv.Key + stamp);
                    if (data.Length > LIST_MAX_BYTES)
                        throw new InvalidDataException(kv.Key + ": слишком большой файл");
                    if (Sha256Hex(data) != kv.Value)
                        throw new InvalidDataException(kv.Key + ": контрольная сумма не сходится — возможно, списки меняли во время загрузки, попробуйте позже");
                    if (!LooksLikeHostlist(Encoding.UTF8.GetString(data)))
                        throw new InvalidDataException(kv.Key + ": не похож на список доменов");
                    files[kv.Key] = data;
                }
                return files;
            }
        }

        /// <summary>Проверить списки в репозитории и, если там новее, применить.</summary>
        private void CheckListsUpdate(bool manual)
        {
            if (listsBusy) return;
            listsBusy = true;
            Task.Run(() =>
            {
                string result = "up_to_date", error = "";
                try
                {
                    var builtin = ReadListsManifest(listsPath);
                    var upd = ReadListsManifest(ListsUpdateDir);
                    int current = Math.Max(builtin != null ? builtin.Version : 0, upd != null ? upd.Version : 0);

                    // Источники по очереди; описание и файлы — всегда из одного,
                    // иначе контрольные суммы разойдутся.
                    ListsManifest remote = null;
                    string remoteJson = null;
                    System.Collections.Generic.Dictionary<string, byte[]> files = null;
                    string firstError = null;
                    foreach (string baseUrl in ListsSources)
                    {
                        try
                        {
                            files = FetchRemoteLists(baseUrl, current, out remote, out remoteJson);
                            break;
                        }
                        catch (Exception ex)
                        {
                            remote = null;
                            files = null;
                            if (firstError == null)
                            {
                                var we = ex as WebException;
                                var resp = we != null ? we.Response as HttpWebResponse : null;
                                firstError = resp != null && resp.StatusCode == HttpStatusCode.NotFound
                                    ? "в репозитории нет описания списков (lists.json)"
                                    : we != null ? "нет связи с GitHub (" + ex.Message + ")" : ex.Message;
                            }
                        }
                    }
                    if (remote == null) throw new InvalidDataException(firstError ?? "источники списков недоступны");

                    if (files == null)
                    {
                        if (manual) SendLog("info", string.Format("Списки сайтов актуальны: версия {0}.", current), "Lists");
                    }
                    else
                    {
                        // Копия для следующих запусков: файлы, затем описание —
                        // без описания неполная копия не применится.
                        string dir = ListsUpdateDir;
                        if (Directory.Exists(dir)) Directory.Delete(dir, true);
                        Directory.CreateDirectory(dir);
                        foreach (var kv in files) File.WriteAllBytes(Path.Combine(dir, kv.Key), kv.Value);
                        File.WriteAllText(Path.Combine(dir, ListsManifestName), remoteJson, new UTF8Encoding(false));

                        foreach (var kv in files) ReplaceFileAtomically(Path.Combine(listsPath, kv.Key), kv.Value);
                        result = "updated";
                        SendLog("success", string.Format(
                            "Списки сайтов обновлены: версия {0} от {1} (была {2}). Ядро подхватит их само, перезапуск не нужен.",
                            remote.Version, remote.Updated, current), "Lists");
                    }
                }
                catch (Exception ex)
                {
                    result = "error";
                    error = ex.Message;
                    if (manual) SendLog("error", "Не удалось обновить списки сайтов: " + error, "Lists");
                    else WriteLogFile("warn", "Lists", "Автопроверка списков: " + error);
                }
                finally
                {
                    listsBusy = false;
                }
                SendListsInfo(result, error);
            });
        }

        private void ResetListsToBuiltin()
        {
            Task.Run(() =>
            {
                string error = "";
                try
                {
                    if (Directory.Exists(ListsUpdateDir)) Directory.Delete(ListsUpdateDir, true);
                    RestoreBuiltinLists();
                    SendLog("info", "Списки сайтов возвращены к встроенным в программу.", "Lists");
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                    SendLog("error", "Не удалось вернуть встроенные списки: " + error, "Lists");
                }
                SendListsInfo(error.Length == 0 ? "reset" : "error", error);
            });
        }

        // ================= Автозапуск при входе в Windows ======================
        //
        // Через Планировщик заданий, а не ключ Run в реестре: программе нужны
        // права администратора, а программы из Run Windows с повышением прав
        // не запускает вовсе (или спрашивает UAC при каждом входе). Задача с
        // «наивысшими правами» стартует сразу повышенной и без вопросов.
        //
        // Работаем через COM-интерфейс Планировщика, а не schtasks.exe: тот
        // пишет вывод в OEM-кодировке, и путь с кириллицей («Мои проекты»)
        // при чтении превращался бы в кашу. Состояние — сама задача в
        // Планировщике, а не флажок в настройках: интерфейс показывает то,
        // что есть на самом деле.

        private const string AutostartArg = "--autostart";

        /// <summary>Имя задачи. С именем пользователя: на одном компьютере их может быть несколько.</summary>
        private static string AutostartTaskName
        {
            get { return "Zapret2 Control Center (" + Environment.UserName + ")"; }
        }

        private static object ComCall(object target, string method, params object[] args)
        {
            return target.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, target, args);
        }

        private static object ComGet(object target, string property, params object[] args)
        {
            return target.GetType().InvokeMember(property, BindingFlags.GetProperty, null, target, args);
        }

        private static object OpenTaskRootFolder()
        {
            Type t = Type.GetTypeFromProgID("Schedule.Service");
            if (t == null) throw new InvalidOperationException("служба Планировщика заданий недоступна");
            object service = Activator.CreateInstance(t);
            ComCall(service, "Connect");
            return ComCall(service, "GetFolder", "\\");
        }

        /// <summary>Ошибка COM, обёрнутая отражением, — достаём настоящую.</summary>
        private static Exception UnwrapCom(Exception ex)
        {
            var tie = ex as TargetInvocationException;
            return tie != null && tie.InnerException != null ? tie.InnerException : ex;
        }

        private static bool IsNotFound(Exception ex)
        {
            // 0x80070002 — «файл не найден»: такой задачи нет.
            return Marshal.GetHRForException(UnwrapCom(ex)) == unchecked((int)0x80070002);
        }

        /// <summary>Есть ли задача автозапуска; path — какой exe она запускает.</summary>
        private static bool ReadAutostartTask(out string path)
        {
            path = "";
            object folder = OpenTaskRootFolder();
            object task;
            try
            {
                task = ComCall(folder, "GetTask", AutostartTaskName);
            }
            catch (Exception ex)
            {
                if (IsNotFound(ex)) return false;
                throw;
            }
            try
            {
                object actions = ComGet(ComGet(task, "Definition"), "Actions");
                path = (ComGet(ComGet(actions, "Item", 1), "Path") as string) ?? "";
            }
            catch { }
            return true;
        }

        private static string BuildAutostartTaskXml(string exe)
        {
            string sid = WindowsIdentity.GetCurrent().User.Value;
            string dir = Path.GetDirectoryName(exe) ?? "";
            Func<string, string> esc = s => System.Security.SecurityElement.Escape(s);

            // Важное в настройках: без ExecutionTimeLimit=PT0S Планировщик
            // снял бы программу через 72 часа, без двух «Batteries» — не
            // запустил бы ноутбук от батареи. Priority 4 — обычный приоритет
            // процесса: по умолчанию задачи идут с «ниже среднего», и winws
            // унаследовал бы его.
            var sb = new StringBuilder();
            sb.Append("<?xml version=\"1.0\" encoding=\"UTF-16\"?>");
            sb.Append("<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">");
            sb.Append("<RegistrationInfo><Author>Zapret2 Control Center</Author><Description>")
              .Append(esc("Запуск Zapret2 Control Center при входе в Windows. Включается и выключается в настройках программы."))
              .Append("</Description></RegistrationInfo>");
            sb.Append("<Triggers><LogonTrigger><Enabled>true</Enabled><UserId>").Append(sid).Append("</UserId></LogonTrigger></Triggers>");
            sb.Append("<Principals><Principal id=\"Author\"><UserId>").Append(sid)
              .Append("</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>");
            sb.Append("<Settings>");
            sb.Append("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
            sb.Append("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
            sb.Append("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>");
            sb.Append("<AllowHardTerminate>true</AllowHardTerminate>");
            sb.Append("<StartWhenAvailable>false</StartWhenAvailable>");
            sb.Append("<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>");
            sb.Append("<IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>");
            sb.Append("<AllowStartOnDemand>true</AllowStartOnDemand>");
            sb.Append("<Enabled>true</Enabled>");
            sb.Append("<Hidden>false</Hidden>");
            sb.Append("<RunOnlyIfIdle>false</RunOnlyIfIdle>");
            sb.Append("<WakeToRun>false</WakeToRun>");
            sb.Append("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
            sb.Append("<Priority>4</Priority>");
            sb.Append("</Settings>");
            sb.Append("<Actions Context=\"Author\"><Exec><Command>").Append(esc(exe))
              .Append("</Command><Arguments>").Append(AutostartArg)
              .Append("</Arguments><WorkingDirectory>").Append(esc(dir))
              .Append("</WorkingDirectory></Exec></Actions>");
            sb.Append("</Task>");
            return sb.ToString();
        }

        private static void RegisterAutostartTask()
        {
            object folder = OpenTaskRootFolder();
            // 6 = TASK_CREATE_OR_UPDATE, 3 = TASK_LOGON_INTERACTIVE_TOKEN;
            // учётная запись и пароль не нужны — пользователь указан в XML.
            ComCall(folder, "RegisterTask", AutostartTaskName,
                BuildAutostartTaskXml(Application.ExecutablePath), 6, null, null, 3, null);
        }

        private static void DeleteAutostartTask()
        {
            object folder = OpenTaskRootFolder();
            try
            {
                ComCall(folder, "DeleteTask", AutostartTaskName, 0);
            }
            catch (Exception ex)
            {
                if (!IsNotFound(ex)) throw;
            }
        }

        private static bool SamePath(string a, string b)
        {
            try { return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
            catch { return string.Equals(a, b, StringComparison.OrdinalIgnoreCase); }
        }

        /// <summary>Состояние автозапуска — в интерфейс. error — текст неудачи последнего действия.</summary>
        private void SendAutostartState(string error)
        {
            bool enabled = false;
            string path = "";
            try
            {
                enabled = ReadAutostartTask(out path);
            }
            catch (Exception ex)
            {
                if (string.IsNullOrEmpty(error))
                    error = "Не удалось прочитать задачу Планировщика: " + UnwrapCom(ex).Message;
            }
            bool current = !enabled || path.Length == 0 || SamePath(path, Application.ExecutablePath);
            SendToWeb(string.Format(
                "{{\"type\":\"autostart\",\"enabled\":{0},\"current\":{1},\"path\":\"{2}\",\"error\":\"{3}\"}}",
                enabled ? "true" : "false", current ? "true" : "false", JsonEscape(path), JsonEscape(error ?? "")));
        }

        private void SetAutostart(bool on)
        {
            Task.Run(() =>
            {
                string error = "";
                try
                {
                    if (on)
                    {
                        RegisterAutostartTask();
                        SendLog("success", "Автозапуск включён: программа будет запускаться при входе в Windows — " +
                            Application.ExecutablePath, "Autostart");
                    }
                    else
                    {
                        DeleteAutostartTask();
                        SendLog("info", "Автозапуск выключен.", "Autostart");
                    }
                }
                catch (Exception ex)
                {
                    error = (on ? "Не удалось включить автозапуск: " : "Не удалось выключить автозапуск: ") + UnwrapCom(ex).Message;
                    SendLog("error", error, "Autostart");
                }
                SendAutostartState(error);
            });
        }

        /// <summary>
        /// При старте: задача запускает файл, которого больше нет (программу
        /// перенесли или скачали заново в другое место), — переводим её на
        /// этот. Если тот файл на месте, ничего не трогаем: человек мог
        /// просто открыть другую копию, например прямо из архива во временной
        /// папке, и автозапуск не должен молча уехать туда. Такой случай
        /// интерфейс показывает и предлагает перенастроить.
        /// </summary>
        private void RepointAutostartTask()
        {
            try
            {
                string path;
                if (!ReadAutostartTask(out path)) return;
                if (path.Length == 0 || SamePath(path, Application.ExecutablePath) || File.Exists(path)) return;
                RegisterAutostartTask();
                WriteLogFile("info", "Autostart", "Файла автозапуска больше нет (" + path +
                    "), задача переведена на этот: " + Application.ExecutablePath);
            }
            catch (Exception ex)
            {
                WriteLogFile("warn", "Autostart", "Не удалось проверить задачу автозапуска: " + UnwrapCom(ex).Message);
            }
        }

        /// <summary>Показать окно: из трея, из свёрнутого состояния, поверх остальных.</summary>
        private void RestoreWindow()
        {
            this.Show();
            if (this.WindowState == FormWindowState.Minimized) this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void SetupTray()
        {
            try
            {
                trayMenu = new ContextMenu();
                trayMenu.MenuItems.Add("Открыть Zapret2", (s, e) => RestoreWindow());
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
                    // StopZapretProcess уже снял своё ядро, так что здесь
                    // считаются только оставшиеся посторонние процессы.
                    int gone = KillZombieWinDivert();
                    trayIcon.ShowBalloonTip(1500, "Zapret2 Watchdog",
                        gone > 0
                            ? "Завершено процессов winws.exe: " + gone
                            : "Обход остановлен, лишних процессов winws.exe не найдено",
                        ToolTipIcon.Info);
                });
                trayMenu.MenuItems.Add("-");
                trayMenu.MenuItems.Add("Выход", (s, e) => {
                    isExiting = true;
                    try { if (tgStatusTimer != null) tgStatusTimer.Stop(); } catch { }
                    try { if (tgProxy != null) tgProxy.Stop(); } catch { }
                    StopZapretProcess();
                    KillZombieWinDivert();
                    TryStopWinDivertService();
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
                    trayIcon.Icon = LoadAppIcon(true);
                }
                catch { }
                trayIcon.ContextMenu = trayMenu;
                trayIcon.Visible = true;

                trayIcon.DoubleClick += (s, e) => RestoreWindow();
            }
            catch { }
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            // Выключение компьютера и выход из системы прятать в трей нельзя:
            // отменённое закрытие Windows считает отказом и показывает «это
            // приложение мешает завершить работу». С автозапуском программа
            // живёт всегда, и это стало бы видно при каждом выключении.
            if (e.CloseReason == CloseReason.WindowsShutDown || e.CloseReason == CloseReason.TaskManagerClosing)
            {
                isExiting = true;
                try { if (tgStatusTimer != null) tgStatusTimer.Stop(); } catch { }
                try { if (tgProxy != null) tgProxy.Stop(); } catch { }
            }

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
                TryStopWinDivertService();
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
