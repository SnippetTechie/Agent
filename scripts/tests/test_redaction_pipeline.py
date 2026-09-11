"""Verification test for the V.A.R.M.A PII Redaction Pipeline."""

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server.redaction.pii_detector import detector


def test_deterministic_detection():
    print("\n--- 1. Testing Deterministic PII Detection ---")
    sample_text = (
        "Customer Aadhaar is 9876 5432 1098 and PAN is ABCDE1234F. "
        "Contact email is user.test@example.gov.in and phone +91 98765 43210. "
        "Card payment 4532 0150 1234 5678, coordinates 13.0827, 80.2707."
    )

    spans = detector.detect(sample_text)
    print(f"Detected {len(spans)} sensitive spans:")
    for s in spans:
        print(f"  [{s.tag}] ({s.label}): '{s.text}' ({s.start}:{s.end})")

    tags = {s.tag for s in spans}
    labels = {s.label for s in spans}

    assert "ID_NUMBER" in tags, "Expected ID_NUMBER tag (Aadhaar/PAN)"
    assert "Aadhaar" in labels, "Expected Aadhaar label"
    assert "PAN" in labels, "Expected PAN label"
    assert "CONTACT" in tags, "Expected CONTACT tag (email/phone)"
    assert "email" in labels, "Expected email label"
    assert "CREDENTIAL" in tags, "Expected CREDENTIAL tag (card)"
    assert "COORDINATES" in tags, "Expected COORDINATES tag"
    print("[OK] Deterministic PII tests PASSED!")


async def test_api_endpoint():
    print("\n--- 2. Testing /redact/detect FastAPI Endpoint ---")
    from httpx import ASGITransport, AsyncClient
    from server.receiver import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "text": "Hello, my secret token is abcdef1234567890abcdef1234567890. My PAN is ABCDE9876K.",
        }
        res = await client.post("/redact/detect", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        print("Response data:", data)
        assert data.get("ok") is True
        assert data.get("count", 0) >= 2
        targets = [t["text"] for t in data["targets"]]
        assert "ABCDE9876K" in targets
    print("[OK] API Endpoint tests PASSED!")


async def test_enagrik_form():
    print("\n--- 3. Testing e-Nagrik Citizen Portal Detection (User Screenshot) ---")
    portal_text = (
        "e-Nagrik Seva Kendra\n"
        "My Account (Ananya Sharma)\n"
        "Personal Details\n"
        "Full Name: Ananya Sharma\n"
        "Date of Birth: 14-03-1998\n"
        "Aadhaar Number: 5321 8890 4471\n"
        "PAN Number: ATZPS1234K\n"
        "Mobile Number: +91 90123 45678\n"
        "Email Address: ananya.sharma98@sevam\n"
        "Residential Address: H.No. 221, Sector 45, Gandhinagar, Gujarat - 382421\n"
        "Bank & Payment Details\n"
        "Account Holder Name: Ananya Sharma\n"
        "Bank Account Number: 0345 1122 3344 55\n"
        "My e-ID Card\n"
        "Name: Ananya Sharma\n"
        "DOB: 1998-03-14\n"
        "Gender: Female\n"
        "Address: H.No. 221, Sector 45, Gandhinagar, Gujarat - 382421\n"
        "XXXX XXXX 4471\n"
    )

    from httpx import ASGITransport, AsyncClient
    from server.receiver import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/redact/detect", json={"text": portal_text})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        print(f"Detected {data.get('count', 0)} entities from e-Nagrik portal:")
        targets = [t["text"] for t in data.get("targets", [])]
        for t in data.get("targets", []):
            print(f"  - [{t['tag']}] ({t.get('label')}): '{t['text']}'")

        # Verify key targets
        assert any("5321 8890 4471" in t for t in targets), "Aadhaar not found"
        assert any("XXXX XXXX 4471" in t for t in targets), "Masked Aadhaar not found"
        assert any("ATZPS1234K" in t for t in targets), "PAN not found"
        assert any("+91 90123 45678" in t for t in targets), "Mobile not found"
        assert any("ananya.sharma98@sevam" in t for t in targets), "Email not found"
        assert any("0345 1122 3344 55" in t for t in targets), "Bank account not found"
        assert any("14-03-1998" in t for t in targets), "DOB 14-03-1998 not found"
        assert any("1998-03-14" in t for t in targets), "DOB 1998-03-14 not found"
        assert any("Ananya Sharma" in t for t in targets), "Ananya Sharma not found"
        print("[OK] e-Nagrik portal detection PASSED! All 9 sensitive fields detected!")


if __name__ == "__main__":
    test_deterministic_detection()
    asyncio.run(test_api_endpoint())
    asyncio.run(test_enagrik_form())
    print("\n[OK] ALL REDACTION PIPELINE TESTS PASSED!\n")
