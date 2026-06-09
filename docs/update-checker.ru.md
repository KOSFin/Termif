# Автообновления Termif

## Что включено

Termif использует официальный Tauri updater plugin. Приложение при запуске и затем раз в 6 часов вызывает updater `check()`.

Если доступна stable-версия:

- справа снизу появляется уведомление с кнопкой `Update`;
- в нижнем статусбаре появляется компактная кнопка `Update <version>`;
- кнопка скачивает и устанавливает обновление внутри приложения;
- после установки UI предлагает `Restart`, чтобы перезапустить Termif на новую версию.

Prerelease-каналы (`beta`, `alpha`, `rc`, `nightly`, `unstable`) публикуются как GitHub prerelease, но не попадают в stable updater endpoint. Обычные пользователи получают только stable-обновления.

## Подпись updater

Это не Apple/Windows code signing. Это отдельная подпись Tauri updater:

- public key вшивается в production build;
- private key хранится только в GitHub Secrets;
- Tauri CLI подписывает updater artifacts;
- приложение проверяет `.sig` перед установкой.

Без валидной подписи приложение не установит обновление.

## GitHub Secrets

Для stable updater-релизов нужны secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — приватный ключ Tauri signer.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — пароль ключа, если он был задан.
- `TAURI_UPDATER_PUBKEY` — public key, который будет вшит в приложение.

Сгенерировать ключи:

```bash
npm run tauri signer generate -- -w ~/.termif-updater.key
```

Public key из вывода положить в `TAURI_UPDATER_PUBKEY`, private key из файла/вывода положить в `TAURI_SIGNING_PRIVATE_KEY`.

## Как выпускать релиз

Релиз создается только если в последнем commit message или workflow input есть SemVer-версия.

Примеры commit message:

```text
release 0.2.0 [stable]
```

```text
fix ssh reconnect 0.2.1
```

```text
new terminal scroll 0.3.0-beta.1
```

```text
try updater 0.3.0 [beta]
```

Если версии нет, CI выполнит проверки, но release/build job не запустит.

## Каналы

Канал можно указать через маркер:

- `[stable]`
- `[beta]`
- `[alpha]`
- `[rc]`
- `[nightly]`
- `[unstable]`
- `[channel: beta]`

Если версия уже содержит prerelease suffix (`0.3.0-beta.1`), канал определяется из него. Если suffix нет и канал не указан, релиз считается stable.

Если указать `0.3.0 [beta]`, CI превратит версию в `0.3.0-beta.<run_number>`.

## Что публикует CI

Stable release публикует:

- обычные installers/packages для ручной установки;
- updater artifacts;
- `.sig` подписи;
- `latest.json` для stable updater endpoint.

Prerelease публикует installers/packages и `.sig`, но не публикует `latest.json`.

Stable endpoint:

```text
https://github.com/KOSFin/Termif/releases/latest/download/latest.json
```

GitHub `latest` указывает только на последний non-prerelease release, поэтому beta/nightly не попадут в автообновления stable-сборок.
