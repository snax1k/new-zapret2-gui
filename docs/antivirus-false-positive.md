# Отправка ложного срабатывания антивирусам

Памятка на случай, когда очередную сборку забраковал антивирус. Первый раз это
случилось с `v0.1.4` 2026-09-05.

Отправлять должен владелец репозитория: формы требуют учётной записи, а образец
загружается на сторонний сервис. Здесь собрано всё, что нужно вписать, чтобы не
собирать данные заново.

## Данные о сборке v0.1.4

| поле | значение |
|---|---|
| Файл | `Zapret2-GUI-v0.1.4-portable.exe` |
| Размер | 2 583 040 байт |
| SHA-256 | `f841627222017afac8d0992fa31126abd34b9bfd35369d1a307f1a6e0f70cf69` |
| SHA-1 | `5d0034c1774f3c7db67865d141ec10c9c4e3fac9` |
| MD5 | `9641b5c980b766fe891a3fcaff10a500` |
| Откуда скачан | https://github.com/snax1k/new-zapret2-gui/releases/tag/v0.1.4 |
| Вердикт Defender | `Trojan:Win32/Wacatac.B!ml` (ранее `Trojan:Win32/Wacatac.H!ml`) |
| Версия движка | 1.1.26080.3 |
| Версия сигнатур | 1.459.64.0 |

Хэши берутся так:

```powershell
Get-FileHash .\release-v0.1.4\Zapret2-GUI-v0.1.4-portable.exe -Algorithm SHA256
```

Если файл не читается — его уже забрал антивирус. Восстановить из репозитория:
`git checkout -- release-v0.1.4/Zapret2-GUI-v0.1.4-portable.exe`.

## Microsoft

Форма: **https://www.microsoft.com/en-us/wdsi/filesubmission**

Выбрать «Software developer» и вход через учётную запись Microsoft — заявки от
разработчика рассматриваются отдельной очередью и быстрее анонимных.

Что указать в форме:

* **Detection name:** `Trojan:Win32/Wacatac.B!ml`
* **Do you believe this is a false positive?** — да.
* **Product / version:** Zapret2 Control Center 0.1.4

Текст для поля с описанием (по-английски, форма англоязычная):

> Zapret2 Control Center is an open-source GUI for the DPI-bypass utility
> bol-van/zapret. Source code: https://github.com/snax1k/new-zapret2-gui
>
> The executable is a .NET Framework application that embeds winws.exe and the
> WinDivert driver as resources, extracts them to %LOCALAPPDATA% on start and
> runs them elevated. This is the intended and documented behaviour of the
> tool: it filters the user's own outgoing TCP traffic to work around ISP-level
> DPI blocking. It does not collect data, contact any server other than the
> GitHub Releases API for update checks, or modify other applications.
>
> The build is unsigned and newly published, which we believe is why the ML
> heuristic flags it. Builds 0.1.2 and 0.1.3 from the same source tree are not
> detected; 0.1.4 was flagged about two hours after publication.
>
> Please review as a false positive.

## Яндекс

Форма: **https://yandex.ru/support/browser/troubleshooting/false-detection.html**
— оттуда ведёт ссылка на форму обращения. Альтернатива — раздел «Безопасность»
в поддержке Яндекс.Браузера.

Текст (по-русски):

> Яндекс.Браузер блокирует скачивание файла
> Zapret2-GUI-v0.1.4-portable.exe с
> https://github.com/snax1k/new-zapret2-gui/releases/tag/v0.1.4
> как вредоносный. Это ложное срабатывание.
>
> Это графическая оболочка с открытым исходным кодом для утилиты обхода
> блокировок bol-van/zapret. Исходники: https://github.com/snax1k/new-zapret2-gui
>
> Приложение распаковывает из своих ресурсов winws.exe и драйвер WinDivert и
> запускает их с правами администратора — это его штатная и описанная работа:
> оно фильтрует исходящий трафик самого пользователя, чтобы обойти блокировки
> на уровне провайдера. Данные не собираются, обращений к сторонним серверам
> нет, кроме проверки обновлений через API GitHub Releases.
>
> SHA-256: f841627222017afac8d0992fa31126abd34b9bfd35369d1a307f1a6e0f70cf69
>
> Прошу пересмотреть вердикт.

## Чего ждать

Ответ обычно за 1–3 дня. Снятие вердикта распространяется на **конкретный
файл**, а не на проект: следующая сборка может быть помечена снова.

Пока нет сертификата подписи, отправлять придётся на каждый релиз. Поэтому
проверять сборку надо до объявления релиза — скачать ассет с GitHub и посчитать
хэш; если файл не читается, его забрал антивирус.

## Что действительно закрывает вопрос

Сертификат подписи кода. Репутация накапливается на издателя, а не на каждый
файл, и новые сборки перестают быть «неизвестными» и для SmartScreen, и для
Яндекс.Браузера.

* OV — примерно 200–400 $ в год, репутация набирается постепенно;
* EV — примерно 400–700 $ в год, доверие SmartScreen сразу.

С 2023 года закрытый ключ обязан храниться на аппаратном токене или в HSM —
файлом сертификат больше не выдают, и подписывать придётся с этой машины либо
через облачный HSM.
