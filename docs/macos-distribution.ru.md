# macOS: распространение без Apple Developer ID

## Коротко

Публичный macOS-релиз без платного Apple Developer Program нельзя сделать полностью бесшовным: Gatekeeper не доверяет скачанным unsigned/ad-hoc приложениям и может показать сообщение, что приложение повреждено. Это не всегда означает битый `.app`; часто это отсутствие Developer ID подписи и notarization.

Termif можно распространять как unsigned build, но в релизе нужно явно приложить инструкцию запуска.

## Для пользователя

Если macOS показывает сообщение, что `Termif.app` повреждено:

```bash
APP="/Applications/Termif.app"

codesign --verify --deep --strict --verbose=4 "$APP"
spctl -a -vvv -t open "$APP"
xattr -l "$APP"
```

Если в выводе есть `com.apple.quarantine`, а `spctl` отклоняет приложение, для локального запуска можно выполнить:

```bash
APP="/Applications/Termif.app"

sudo codesign --force --deep --sign - "$APP"
xattr -dr com.apple.quarantine "$APP"
open "$APP"
```

Если приложение лежит не в `/Applications`, замените путь или перетащите `Termif.app` в окно Terminal после `APP=`.

## Для релиза

Unsigned-релиз должен публиковаться с заметкой:

```text
macOS: сборка не notarized, потому что проект пока распространяется без Apple Developer ID.
Если macOS пишет, что приложение повреждено, выполните команды из docs/macos-distribution.ru.md.
```

## Если есть Apple Developer ID

Правильный публичный путь для macOS:

1. Подписать приложение Developer ID Application сертификатом.
2. Отправить build на notarization Apple.
3. Staple notarization ticket к `.app`/`.dmg`.
4. Публиковать notarized `.dmg`.

После этого пользователю не нужны `xattr` или локальное переподписание.
