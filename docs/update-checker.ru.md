# Автообновления через GitHub

## Что уже включено

В интерфейсе есть легкий GitHub release checker. Он:

- берет текущую версию приложения через Tauri API;
- читает `https://api.github.com/repos/<owner>/<repo>/releases/latest`;
- сравнивает SemVer версии;
- показывает нижний баннер, если latest release новее текущей сборки;
- открывает страницу релиза по кнопке `Update`.

В релизной GitHub Actions сборке `VITE_UPDATE_REPO` автоматически задается как `${{ github.repository }}`.

Для локальной проверки:

```bash
VITE_UPDATE_REPO=owner/repo npm run dev
```

## Почему это пока не полноценный auto-install

Полноценное “скачал, проверил подпись, установил и перезапустил” в Tauri v2 делается через официальный updater plugin. Ему нужны updater-артефакты и подписи `.sig`; проверку подписи отключить нельзя. Поэтому текущий модуль сделан как безопасный первый этап: найти новую версию и привести пользователя к релизу.

## Следующий этап

Когда будет готова подписанная updater-цепочка:

1. Установить официальный Tauri updater plugin.
2. Сгенерировать updater key pair.
3. Включить `bundle.createUpdaterArtifacts`.
4. Публиковать `latest.json` и подписанные artifacts в GitHub Release.
5. Заменить кнопку `Update` в `UpdateBanner` на download/install через plugin API.
