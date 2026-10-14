# Historical feature ledger

Check this before repeating era research. The restoration target is client **123.5.1**; “after that client” and “after 2012” are different claims. This is a growing research record, not a complete list or an implementation checklist.

Keep one entry per distinct feature with its classification, dated evidence, conclusion, last check and what would justify reopening it. Prefer dated official announcements or pinned source; identify community reports and emulator behavior as such. Missing client strings and bundled XML alone do not establish production availability.

Classifications: **confirmed post-2012** requires dated introduction evidence; **non-original extension** identifies an external/custom feature without inventing an official release date; **unresolved** preserves an open question without scoring it as historical restoration.

## Dungeon modifiers and key refinement

- Classification: **confirmed post-2012**. Last checked: **2026-10-14**.
- Evidence: DECA's [Dungeon Modifiers: An overview](https://remaster.realmofthemadgod.com/?p=2123), published **2021-08-24**, identifies the first modifier batch and key-refinement system with version **2.0.2**.
- Conclusion: exclude these systems from the 2012 restoration target. This date is the announcement date; no more precise deployment time is asserted.
- Reopen only for contradictory dated primary evidence or a deliberate target change.

## MrEyeball `lefttomax` bot query

- Classification: **non-original extension** (external RealmEye bot). Last checked: **2026-10-14**.
- Evidence: the [Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=874635040), posted **2017-03-01**, documents `/tell mreyeball lefttomax`; the [2017-03-28 request to DECA](https://www.reddit.com/r/RotMG/comments/61zbdd) distinguishes this bot query from a native command. These are dated community sources, not official release notes.
- Conclusion: evidence of the bot query by March 2017, not its introduction date and not a native 2012 command. Keep external bot functionality outside the target unless separately requested.
- Reopen for earlier dated bot documentation or an official command specification.

## Native `/lefttomax` command

- Classification: **unresolved**. Last checked: **2026-10-14**.
- Evidence: the same [2017-03-28 request](https://www.reddit.com/r/RotMG/comments/61zbdd) asks why `/lefttomax` does not work instead of the bot query. No official 2012 native-command evidence or exact introduction date was substantiated. The selected [123.5.1 client](https://github.com/OpenRotMG/Open-RotMG-Client/blob/7e3f4b83df7f65ea2a7b57b10c2288ef02c5ae8c/client.swf) has no located command literal, but forwards ordinary chat to the server, so absence of that literal is not proof of absence.
- Conclusion: do not claim it was an original command or assign a later official release date. A proposed implementation would need explicit treatment as an extension until historical evidence changes this conclusion.
- Reopen only with dated official documentation, authenticated target-server behavior or period footage showing the native command and response.

## Seven-dose health and magic elixirs

- Classification: **unresolved**. Last checked: **2026-10-14**.
- Evidence: bundled XML contains [Elixir of Health 7](https://github.com/OpenRotMG/Open-RotMG-Server/blob/cfce847552eecaaa489f8103aea078c74e75a205/data/objects.xml#L3519-L3537) and [Elixir of Magic 7](https://github.com/OpenRotMG/Open-RotMG-Server/blob/cfce847552eecaaa489f8103aea078c74e75a205/data/objects.xml#L3650-L3668), with seven doses and successor items. No dated production-availability evidence is recorded here.
- Conclusion: data presence is established; availability in the 2012 production game is not. Do not list these as confirmed post-2012 or silently add them to historical scope.
- Reopen with dated release notes, an authenticated target shop/drop record or period footage of acquisition and use.
