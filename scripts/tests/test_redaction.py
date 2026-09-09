"""Layer-1 redaction tests — no browser required.

Runs the real in-page extractor script (``dom.EXTRACT_SCRIPT``) against a
minimal DOM double implemented in Node, so the regexes and the secret-field
heuristics are verified as they actually ship, not as a copy.

Usage:
    python scripts/tests/test_redaction.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server.agent import dom  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


# A tiny DOM double: enough surface for the extractor's regex paths. The point
# is to exercise scrubText/scrubPII, not to emulate a browser.
NODE_HARNESS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const samples = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const out = {};
for (const [name, text] of Object.entries(samples)) {
  const fakeBody = {
    cloneNode: () => ({
      querySelectorAll: () => [],
      innerText: text,
      textContent: text,
    }),
  };
  const doc = {
    querySelectorAll: () => [],
    body: fakeBody,
    title: 't',
    documentElement: { scrollHeight: 100 },
    scrollingElement: { scrollHeight: 100 },
  };
  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    scrollY: 0,
    scrollX: 0,
    getComputedStyle: () => ({}),
  };
  const loc = { href: 'https://example.test/' };
  // Bind every global the extractor closes over, then run it as it ships.
  const fn = new Function(
    'document', 'window', 'location', 'opts',
    'return (' + src + ')(opts)'
  );
  out[name] = fn(doc, win, loc, { redact: true }).text;
}
console.log(JSON.stringify(out));
"""


def run_node_scrub(samples: dict[str, str]) -> dict[str, str]:
    """Execute the shipped extractor's scrubbing path over the given samples."""
    with tempfile.TemporaryDirectory() as tmp:
        script_path = Path(tmp) / "extract.js"
        samples_path = Path(tmp) / "samples.json"
        harness_path = Path(tmp) / "harness.js"

        script_path.write_text(dom.EXTRACT_SCRIPT, encoding="utf-8")
        samples_path.write_text(json.dumps(samples), encoding="utf-8")
        harness_path.write_text(NODE_HARNESS, encoding="utf-8")

        proc = subprocess.run(
            ["node", str(harness_path), str(script_path), str(samples_path)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr[:2000])
        return json.loads(proc.stdout)


def run_node_secret_hint(fields: list[str]) -> dict[str, bool]:
    """Test the shipped SECRET_HINT / SECRET_AUTOCOMPLETE regexes directly."""
    with tempfile.TemporaryDirectory() as tmp:
        script_path = Path(tmp) / "extract.js"
        harness_path = Path(tmp) / "harness.js"

        script_path.write_text(dom.EXTRACT_SCRIPT, encoding="utf-8")
        harness_path.write_text(SECRET_HARNESS, encoding="utf-8")
        (Path(tmp) / "fields.json").write_text(json.dumps(fields), encoding="utf-8")

        proc = subprocess.run(
            ["node", str(harness_path), str(script_path), str(Path(tmp) / "fields.json")],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr[:2000])
        return json.loads(proc.stdout)


SECRET_HARNESS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const fields = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

// Lift the two heuristic regexes out of the shipped script verbatim, so this
// tests what actually runs in the page rather than a hand-copied duplicate.
function grab(name) {
  const m = src.match(new RegExp('const ' + name + ' = (/.+?/i);'));
  if (!m) throw new Error('could not find ' + name);
  return eval(m[1]);
}
const SECRET_HINT = grab('SECRET_HINT');
const SECRET_AUTOCOMPLETE = grab('SECRET_AUTOCOMPLETE');

const out = {};
for (const f of fields) {
  out[f] = SECRET_HINT.test(f) || SECRET_AUTOCOMPLETE.test(f);
}
console.log(JSON.stringify(out));
"""


def main() -> int:
    print("=" * 66)
    print("  V.A.R.M.A Layer-1 redaction tests (shipped script, Node DOM double)")
    print("=" * 66)

    samples = {
        "aadhaar": "Your UID 1234 5678 9012 is verified",
        "pan": "PAN ABCDE1234F is on file",
        "ssn": "SSN 123-45-6789 provided",
        "card": "card 4111111111111111 expires soon",
        "jwt": "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk stored",
        "coords": "target at 28.6139, 77.2090 confirmed",
        "email": "write to rahul.sharma@isro.gov.in today",
        "clean": "Search for ISRO on Google",
        "order": "Order 12345 has shipped",
    }

    print("\n1. PII patterns are masked")
    scrubbed = run_node_scrub(samples)

    check("Aadhaar masked", "[REDACTED_ID_NUMBER]" in scrubbed["aadhaar"], scrubbed["aadhaar"])
    check("PAN masked", "[REDACTED_ID_NUMBER]" in scrubbed["pan"], scrubbed["pan"])
    check("SSN masked", "[REDACTED_ID_NUMBER]" in scrubbed["ssn"], scrubbed["ssn"])
    check("card masked", "[REDACTED_CREDENTIAL]" in scrubbed["card"], scrubbed["card"])
    check("JWT masked", "[REDACTED_CREDENTIAL]" in scrubbed["jwt"], scrubbed["jwt"])
    check("coordinates masked", "[REDACTED_COORDINATES]" in scrubbed["coords"], scrubbed["coords"])
    check("email masked", "[REDACTED_CREDENTIAL]" in scrubbed["email"], scrubbed["email"])

    print("\n2. Clean text is left intact (no over-masking)")
    check("ordinary query untouched", scrubbed["clean"] == samples["clean"], scrubbed["clean"])
    check("plain number untouched", scrubbed["order"] == samples["order"], scrubbed["order"])

    print("\n3. Secret-field heuristics")
    secret_fields = [
        "password",
        "current-password",
        "new-password",
        "cc-number",
        "cc-csc",
        "one-time-code",
        "otp",
        "cvv",
        "api_key",
        "apikey",
        "auth_token",
        "aadhaar",
        "pan_no",
        "ssn",
        "account_no",
        "ifsc",
        "upi",
        "iban",
        "username",
        "search",
        "q",
        "email",
        "city",
    ]
    detected = run_node_secret_hint(secret_fields)

    must_detect = [
        "password",
        "current-password",
        "new-password",
        "cc-number",
        "cc-csc",
        "one-time-code",
        "otp",
        "cvv",
        "api_key",
        "apikey",
        "auth_token",
        "aadhaar",
        "pan_no",
        "ssn",
        "account_no",
        "ifsc",
        "upi",
        "iban",
    ]
    must_not_detect = ["username", "search", "q", "email", "city"]

    for field in must_detect:
        check(f"'{field}' recognized as secret", detected.get(field) is True)
    for field in must_not_detect:
        check(f"'{field}' not treated as secret", detected.get(field) is False)

    print("\n4. The extractor never emits raw secret values")
    src = dom.EXTRACT_SCRIPT
    check("password value replaced with [REDACTED]", "'[REDACTED]'" in src)
    check("secret fields flagged for the prompt", "entry.secret = true" in src)
    check("secret labels use a semantic tag", "[REDACTED_INPUT_FIELD]" in src)
    check("redaction report is returned", "redactions: Object.values(merged)" in src)
    check("toggle can disable redaction", "opts.redact === false" in src)

    print("\n" + "=" * 66)
    if FAILURES:
        print(f"  {len(FAILURES)} FAILURE(S): {', '.join(FAILURES)}")
        return 1
    print("  ALL REDACTION TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
