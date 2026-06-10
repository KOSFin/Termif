<p align="center">
  <img src="src-tauri/icons/icon.ico" alt="Иконка Termif" width="96" height="96" />
</p>

<h1 align="center">Termif</h1>

<p align="center">
  Local-first кроссплатформенный SSH workspace: локальные shell-сессии, удаленные хосты, контекстные файлы, сниппеты и встроенное редактирование.
</p>

<p align="center">
  <img alt="Платформы Windows macOS Linux" src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0A7A3E" />
  <img alt="Desktop Tauri" src="https://img.shields.io/badge/Desktop-Tauri%20v2-1B7F6B" />
  <img alt="Backend Rust" src="https://img.shields.io/badge/Backend-Rust-8C4A2F" />
  <img alt="Frontend React TypeScript" src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%205-2457A6" />
  <img alt="Terminal xterm" src="https://img.shields.io/badge/Terminal-xterm.js-2F2F2F" />
  <img alt="CI Cross Platform" src="https://img.shields.io/badge/CI-Cross--Platform-green" />
</p>

<p align="center">
  <a href="https://kosfin.github.io/Termif/">
    <img alt="Скачать с сайта" src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-%D0%A1%D0%B0%D0%B9%D1%82-61AFEF?style=for-the-badge" />
  </a>
  <a href="https://github.com/KOSFin/Termif/releases">
    <img alt="GitHub Releases" src="https://img.shields.io/badge/GitHub-Releases-98C379?style=for-the-badge&logo=github" />
  </a>
  <a href="CONTRIBUTING.ru.md">
    <img alt="Участие в разработке" src="https://img.shields.io/badge/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%B8%D0%B5-%D0%93%D0%B0%D0%B9%D0%B4-E5C07B?style=for-the-badge" />
  </a>
</p>

Язык: 🇬🇧 [English](README.md) | 🇷🇺 [Русский](README.ru.md)

Хабы документации: 🇬🇧 [Documentation](docs/README.md) | 🇷🇺 [Документация](docs/README.ru.md)

## Демо

<p align="center">
  <video src="docs/screenshots/demo.mp4" controls width="100%"></video>
</p>

## Что Такое Termif

Termif - это local-first desktop SSH workspace для инженеров и операторов, которые постоянно переключаются между локальными и удаленными окружениями. Приложение объединяет локальные PTY-сессии, SSH-подключения, файловую навигацию, сниппеты и редактор в едином контексте активной вкладки. Это не набор несвязанных утилит, а рабочая среда, где терминал, файлы и редактор синхронизированы между собой.

Текущая продуктовая линия ориентирована на Windows, macOS и Linux из одной кодовой базы. Платформенные различия вынесены в отдельные места: shell-профили, горячие клавиши, root-пути локальной файловой системы, элементы управления окном и упаковка релизов.

## Why Termif

Termif сделан для ежедневной SSH-нагруженной работы, где полезный контекст должен оставаться на вашей машине. Hosts, settings, snippets и восстановление UI хранятся локально по умолчанию. Удаленные подключения выполняются явно, host-key trust виден пользователю, а detached SSH-вкладки переподключаются только по явному действию.

Это не “еще один терминал с темой”. Termif - сфокусированный workspace для перехода между shell, удаленными файлами, быстрыми командами и release checks без рассыпания работы по разным приложениям.

## Типичный Workflow

1. Откройте локальную shell-вкладку.
2. Перейдите в SSH picker или импортируйте хосты из `~/.ssh/config`.
3. Подключитесь к хосту, откройте локальный или удаленный путь активной вкладки, preview/edit файл.
4. Запустите сохраненный snippet в активный терминал.
5. После рестарта или обрыва сети переподключите detached SSH-вкладку явно.

## Для Кого

Termif подходит разработчикам, solo operators, homelab-владельцам и небольшим infra-командам, которым нужен нативный desktop workspace для многих машин. Особенно хорошо он ложится на сценарии, где важны локальные настройки, предсказуемые хоткеи, контекстный файловый менеджер и проверяемые release artifacts.

## Проверка Загрузок

Скачивайте установщики только с [сайта Termif](https://kosfin.github.io/Termif/) или из [GitHub Releases](https://github.com/KOSFin/Termif/releases). В релизах публикуются `checksums-*.txt`, когда CI готовит bundles. Перед установкой сверяйте SHA-256 скачанного файла с соответствующим checksum.

Stable updater manifests подписываются отдельно через Tauri updater signing secrets. Windows/macOS code signing и notarization пока остаются задачами hardening roadmap, а не готовой гарантией.

## Что Уже Работает

Интерфейс включает кастомную оболочку окна, расширенные вкладки (переименование, цвета, дублирование, закрытие), командную палитру, настройки и горячие клавиши. Локальные сессии запускаются через portable-pty, SSH-сессии управляются через host picker с импортом из ~/.ssh/config, поддержкой managed hosts, групп и quick connect.

Файловый менеджер контекстный: в локальных вкладках работает с локальной ФС, в SSH-вкладках - с удаленной. Редактор поддерживает preview/edit режимы, dirty-state, докинг, popout-окна и сохранение как локальных, так и удаленных файлов.

Сниппеты хранят часто используемые команды в боковой панели: группы раскрываются как компактные текстовые списки, а команда отправляется в активный терминал одним действием.

В статус-баре для SSH отображаются метрики CPU/RAM/Disk, количество пользователей и серверное время.

## Архитектура И Данные

Фронтенд построен на React + TypeScript + Zustand, backend - на Rust внутри Tauri v2. Поток терминала идет через Tauri Channel, а не через постоянный polling. Основные persist-артефакты: settings.json, hosts.json и ui_state.json в app data директории. Сниппеты и ограниченные по размеру журналы терминала для вкладок сейчас сохраняются в localStorage клиента.

При старте Termif восстанавливает метаданные вкладок. Локальные shell-вкладки запускаются как новые процессы, но прежний видимый scrollback может быть показан из сохраненного журнала вкладки. SSH-вкладки восстанавливаются как detached-состояние с явным reconnect.

Детали:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/settings-model.md](docs/settings-model.md)
- [docs/persistence-model.md](docs/persistence-model.md)

## Поддерживаемые Платформы

Релизная сборка готовит Windows MSI/NSIS, macOS DMG/App и Linux DEB/AppImage. GitHub Actions прогоняет проверки и сборку на Windows, macOS и Ubuntu, после чего публикует артефакты и SHA-256 checksums в GitHub Release.

Локальный shell выбирается по платформе: PowerShell на Windows, zsh на macOS и bash на Linux. Команды приложения используют Ctrl на Windows/Linux и Command на macOS, при этом терминальные последовательности вроде Ctrl+C остаются доступными shell-сессии. Импорт и экспорт SSH-хостов работают через стандартный `~/.ssh/config` в home-директории текущей платформы.

## Скриншоты

![Main workspace Mac](docs/screenshots/mac-mainscreen-bgimage.png)
![Main workspace Mac](docs/screenshots/mac-main-screen.png)
![Main workspace Mac](docs/screenshots/mac-mainscreen-wtht-sidebar.png)
![Main workspace Win](docs/screenshots/win-mainscreen.png)

## Ошибки И Восстановление

Termif отдает конкретные ошибки вместо абстрактных сообщений. Если сессия не найдена, backend возвращает session not found. Ошибки SSH-аутентификации и удаленных операций чтения/записи/листинга пробрасываются в UI с исходным текстом stderr, когда это возможно. При потере соединения вкладка переводится в disconnect-state с возможностью reconnect.

## Лицензия И Коммерческое Использование

Проект использует source-available attribution license. Исходники можно использовать, копировать, модифицировать и распространять с заметной атрибуцией оригинального проекта Termif. Коммерческое распространение, платный хостинг, перепродажа или включение Termif в коммерческий продукт требуют предварительного письменного разрешения maintainers.

Это осознанно не OSI open-source лицензия вроде MIT или Apache-2.0: такие лицензии разрешают коммерческое использование без дополнительного согласования.

Полный текст: [LICENSE](LICENSE).
