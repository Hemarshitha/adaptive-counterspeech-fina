"""Deterministic script constraints; deliberately NOT language/meaning detection.

Inspect a normalized copy, never rewrite the candidate. Native Indian scripts may
coexist with Latin English; no percentage/word quota is imposed on code mixing.
"""

import unicodedata as ud

from counterspeech.schemas import Language, OutputScriptValidation, Script

NATIVE = {
    Language.HINDI: "devanagari",
    Language.HINGLISH: "devanagari",
    Language.MALAYALAM: "malayalam",
    Language.MINGLISH: "malayalam",
}


def _script(char):
    cp = ord(char)
    # Include script marks/digits/punctuation and Devanagari extensions, not
    # just consonants. One leaked native character must fail Romanized output.
    if 0x0900 <= cp <= 0x097F or 0xA8E0 <= cp <= 0xA8FF or 0x11B00 <= cp <= 0x11B5F:
        return "devanagari"
    if 0x0D00 <= cp <= 0x0D7F:
        return "malayalam"
    category = ud.category(char)
    if category.startswith("L"):
        return "latin" if "LATIN" in ud.name(char, "") else "other"
    if category.startswith("M"):
        # Inherited Latin diacritics; their base is checked separately below.
        if "COMBINING" in ud.name(char, "") and (
            0x0300 <= cp <= 0x036F or 0x1AB0 <= cp <= 0x1AFF or 0x1DC0 <= cp <= 0x1DFF
        ):
            return "inherited"
        # Emoji variation selectors/keycaps are neutral presentation marks.
        if 0xFE00 <= cp <= 0xFE0F or 0xE0100 <= cp <= 0xE01EF or cp == 0x20E3:
            return "common"
        return "other"
    if category.startswith("N") and not char.isascii():
        # Common numbers (e.g. superscripts) are fine; script-specific digits
        # such as Arabic-Indic are not Latin transliteration.
        if not ud.name(char, "").startswith(
            ("DIGIT ", "SUPERSCRIPT ", "SUBSCRIPT ", "VULGAR FRACTION ", "ROMAN NUMERAL ")
        ):
            return "other"
    return "common"


def required_script(language: Language | None, requested: Script, current_text: str):
    if requested == Script.ROMANIZED or language == Language.ENGLISH:
        return "latin"
    native_letters = {
        _script(c)
        for c in current_text
        if ud.category(c).startswith("L") and _script(c) in {"devanagari", "malayalam"}
    }
    target = NATIVE.get(language)
    if target:
        return target if requested == Script.NATIVE or native_letters else "latin"
    # Baseline has no language-analysis call. Infer only script from current
    # input, never linguistic content or history; ambiguous scripts abstain.
    if len(native_letters) > 1:
        return "undetermined"
    return next(iter(native_letters), "latin")


def validate_output_script(text, language, requested, current_text):
    expected = required_script(language, requested, current_text)
    allowed = {"latin", expected}
    counts = {"latin": 0, "devanagari": 0, "malayalam": 0, "other": 0}
    disallowed = set()
    base_script = None
    for char in ud.normalize("NFC", text):
        script = _script(char)
        category = ud.category(char)
        if category.startswith("L"):
            counts[script] += 1
            base_script = script
        elif script == "inherited":
            script = base_script if base_script == "latin" else "other"
        elif not category.startswith("M"):
            base_script = None
        if script not in allowed and script != "common":
            disallowed.add(f"U+{ord(char):04X}")
    reasons = []
    if expected == "undetermined":
        reasons.append("output_script_undetermined")
    if disallowed:
        reasons.append("output_script_disallowed_characters")
    if expected in counts and counts[expected] == 0:
        reasons.append("output_script_required_letters_missing")
    return OutputScriptValidation(
        unicode_version=ud.unidata_version,
        requested_script=requested,
        expected_script=expected,
        valid=not reasons,
        reasons=reasons,
        letter_counts=counts,
        disallowed_codepoints=sorted(disallowed),
    )
