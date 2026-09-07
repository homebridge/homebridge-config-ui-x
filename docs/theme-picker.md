# Accessory theme picker

A compatible Lightbulb can expose a catalog and shared favorites without adding a tile for every effect. The accessory card gains **Controls & themes**. Its dialog keeps power, brightness and color controls together with a searchable theme picker.

## User journey

1. Enable theme support in a compatible plugin and configure its available themes.
2. Open **Controls & themes** on the lamp's Accessories card.
3. Choose a theme or search by name. The UI sends one command and reports an unconfirmed request without retrying it.
4. Open **Edit favorites** and star the effects you want available as shortcuts.
5. Plugins that publish native favorite switches can expose those favorites in Apple Home. The plugin owns the switch behavior and storage; this UI does not modify Apple's renderer.

## Independent upgrades

| Installed combination              | Behavior                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Updated UI with an existing plugin | Existing controls remain available. No theme metadata means no picker.                         |
| Compatible plugin with an older UI | Standard lights and switches remain available. The older UI ignores the added characteristics. |
| Both support this protocol         | Catalog browsing, selection and shared favorites are available.                                |
| Invalid or unsupported catalog     | The UI does not hide controls it cannot replace.                                               |

The UI discovers capabilities from characteristics, not a plugin name or minimum package version. There is no package dependency on a vendor plugin. Theme controls use a checked HAP write acknowledgement; a successful read of an old value is not treated as proof that a command succeeded.

## Protocol version 1

All UUIDs below are custom HAP characteristics, not additions to Apple Home's light controls.

| Characteristic | UUID                                   | Format and permissions                                      |
| -------------- | -------------------------------------- | ----------------------------------------------------------- |
| ThemePicker    | `C48B8A28-40D3-4F51-B51C-A5D39D985991` | STRING, read                                                |
| ThemeCatalog   | `5B530C0B-C1DF-496C-9151-52EAB77FD424` | DATA, read and notify                                       |
| ThemeSelection | `AAEA8272-2EEC-40EC-8C03-0E15FCA30F18` | STRING, read and write                                      |
| ThemeFavorites | `3D8F8A5E-06EC-4780-8C83-0DAAC35B7269` | DATA, read and write; notify and write response recommended |

ThemePicker contains JSON with `version: 1`, a stable UUID `group`, and `role: "source"` on the Lightbulb. A related Switch or Outlet uses `role: "action"` or `role: "favorite"` and a stable 64-character lowercase hexadecimal `id`. Relationships are scoped to the bridge username and group. Duplicate sources or action IDs are not routed by display name or array order.

ThemeCatalog contains base64 encoded UTF-8 JSON:

```json
{ "version": 1, "themes": [{ "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "name": "Ocean" }] }
```

The limit is 1,000 entries and 131,072 encoded characters. Each ID is unique and each nonempty name is at most 256 characters. A selection writes the configured ID to ThemeSelection. Device identifiers, credentials and vendor commands do not belong in the catalog.

ThemeFavorites contains base64 encoded JSON:

```json
{ "version": 1, "revision": 0, "ids": [] }
```

The revision is a nonnegative safe integer. IDs are unique and limited to 99, allowing an Accessory Information service plus one native switch per favorite. A plugin must validate edits against the configured catalog, persist before acknowledgement, increment the revision, and reject stale writes. Previously saved unavailable IDs may be retained, but newly invented IDs must be rejected.

The UI reads before editing. If the write response is lost, it reads the saved state to reconcile without repeating the write. Favorites belong to the lamp and are shared across browsers. Older action-only implementations can keep dashboard shortcuts in the existing layout store; those shortcuts do not create Apple Home accessories.

Native favorite switches are hidden from the Homebridge grid only when the picker can represent their IDs. They remain normal services in HomeKit. The plugin decides how theme selection interacts with power, color, brightness and other favorites.
