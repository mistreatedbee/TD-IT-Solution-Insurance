A single-line input with a label that floats up when the field is focused or filled. Markup is `<div class="td-field"><input placeholder=" "><label>…</label></div>`; the single space in `placeholder` is required for the label to float.

**You provide:** a `label` of one to four words naming the data (not an instruction), an `id` linking label and input, and, for errors, a `td-help td-help--error` line with an icon and a sentence saying what to fix.

**Rules**
- Border is `border-control` (3:1 or better on every surface); focus changes it to `focus-ring`; error changes it to `danger`.
- Never show an error by colour alone: always add the icon and the sentence.
- Validate on blur, not on every key press. For the South African ID number, check the 13 digits and checksum, then show the error.
- Height is 56px; keep the label inside the field, not above it.
