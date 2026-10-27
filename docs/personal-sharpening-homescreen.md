# Personal sharpening home-screen shortcut

The standalone public `/slipning/` page has its own manifest and skate icons, separate from the signed-in team app. The Apple web-app title is `Min slipning`.

Intentionally omit `start_url` from the personal manifest. The Web App Manifest processing algorithm defaults it to the installing document URL, preserving the personal `#nyckel=…` fragment instead of launching the team app or a tokenless `/slipning/`. Do not replace this with a fixed start path. The fragment remains client-side; the static manifest/icons contain no personal information. No capability is copied into local storage or a manifest query string.

Reference: https://www.w3.org/TR/appmanifest/#start_url-member

The platform owns installation and may offer a shortcut rather than full PWA installation. iPhone instructions are Safari → Share → Add to Home Screen. Existing shortcuts may retain the old icon; delete only the old shortcut and add again from the current personal link. Explicit link renewal invalidates previously saved personal shortcuts; add the renewed link.

Verification: build output includes the dedicated manifest and all three exact PNG sizes (180, 192, 512). Confirm on a physical iPhone that a fresh Add to Home Screen uses the skate icon, the title is Min slipning, and cold launch retains the personal fragment. No live player token is required for source/build checks; do not rotate production links for testing.
