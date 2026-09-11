"""LiquidAI LFM2.5 PII Detector Service.

Combines:
  1. LiquidAI/LFM2.5-Encoder-350M-PII-Detector (multilingual token-classification NER)
     detecting 40+ PII categories across 16 languages.
  2. High-precision deterministic patterns (Indian IDs: Aadhaar/PAN, credit cards,
     passwords, API tokens, GPS coordinates).
"""

from __future__ import annotations

import importlib.util
import logging
import os
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from huggingface_hub import hf_hub_download

logger = logging.getLogger("varma.redaction")

MODEL_ID = "LiquidAI/LFM2.5-Encoder-350M-PII-Detector"

# Deterministic patterns for high-precision Indian and standard PII
DETERMINISTIC_PATTERNS = [
    # Indian Permanent Account Number (PAN)
    {"tag": "ID_NUMBER", "label": "PAN", "re": re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")},
    # Credit Card Numbers (16 digits with spaces, dashes, or contiguous)
    {
        "tag": "CREDENTIAL",
        "label": "credit_card",
        "re": re.compile(r"\b(?:4[0-9]{3}|5[1-5][0-9]{2}|6(?:011|5[0-9]{2}))(?:[-\s]?[0-9]{4}){3}\b"),
    },
    # Indian Aadhaar Number (12 digits, spaced or dashed, strictly 3 groups of 4)
    {
        "tag": "ID_NUMBER",
        "label": "Aadhaar",
        "re": re.compile(r"\b[0-9]{4}[\s-][0-9]{4}[\s-][0-9]{4}(?![\s-][0-9])\b"),
    },
    {"tag": "ID_NUMBER", "label": "Aadhaar", "re": re.compile(r"\b[xX]{4}[\s-][xX]{4}[\s-][0-9]{4}(?![\s-][0-9])\b")},
    # Bank Account Numbers (e.g. 0345 1122 3344 55 (4 groups) or contiguous 10-18 digits)
    {
        "tag": "FINANCIAL",
        "label": "bank_account",
        "re": re.compile(r"\b\d{3,5}(?:[\s-]\d{2,5}){3,4}\b|\b\d{10,18}\b"),
    },
    # Date of birth / Date patterns (DD-MM-YYYY or YYYY-MM-DD or DD/MM/YYYY)
    {"tag": "DOB", "label": "dob", "re": re.compile(r"\b(?:\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})\b")},
    # US Social Security Number (SSN)
    {"tag": "ID_NUMBER", "label": "SSN", "re": re.compile(r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b")},
    # Auth Tokens / JWTs / API Keys / Secrets
    {
        "tag": "CREDENTIAL",
        "label": "token",
        "re": re.compile(
            r"\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|[a-fA-F0-9]{32,})\b"
        ),
    },
    # GPS Coordinates
    {
        "tag": "COORDINATES",
        "label": "coords",
        "re": re.compile(r"\b-?[0-9]{1,3}\.[0-9]{4,}\s*[,;]\s*-?[0-9]{1,3}\.[0-9]{4,}\b"),
    },
    # Email addresses
    {
        "tag": "CONTACT",
        "label": "email",
        "re": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\b"),
    },
    # Phone numbers (Indian mobiles + standard international)
    {
        "tag": "CONTACT",
        "label": "phone",
        "re": re.compile(r"(?:\+91[\s-]?)?[6789]\d{4}[\s-]?\d{5}\b|\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    },
]


@dataclass
class PIISpan:
    text: str
    tag: str
    label: str
    start: int
    end: int
    confidence: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class LFM25PIIDetector:
    """Wrapper around LiquidAI LFM2.5-Encoder-350M-PII-Detector."""

    def __init__(self, model_id: str = MODEL_ID) -> None:
        self.model_id = model_id
        self._model = None
        self._tokenizer = None
        self._decoder = None
        self._loaded = False
        self._loading = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load_model(self) -> bool:
        """Download and initialize tokenizer and model."""
        if self._loaded:
            return True
        if self._loading:
            return False

        self._loading = True
        try:
            logger.info("Loading LiquidAI LFM2.5 PII Detector (%s)...", self.model_id)

            # Download hybrid decode helper scripts
            helper_path = hf_hub_download(self.model_id, "pii_hybrid_decode.py")
            hf_hub_download(self.model_id, "context_cued.py")
            helper_dir = str(Path(helper_path).parent)
            if helper_dir not in sys.path:
                sys.path.insert(0, helper_dir)

            spec = importlib.util.spec_from_file_location("pii_hybrid_decode", helper_path)
            if spec and spec.loader:
                hd = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(hd)
                self._decoder = hd
            else:
                logger.error("Could not load pii_hybrid_decode helper script")
                self._loading = False
                return False

            from transformers import AutoModelForTokenClassification, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(self.model_id, trust_remote_code=True)
            self._model = AutoModelForTokenClassification.from_pretrained(
                self.model_id, trust_remote_code=True
            ).eval()

            self._loaded = True
            logger.info("LiquidAI LFM2.5 PII Detector loaded successfully!")
            return True
        except Exception as exc:
            logger.error("Failed to load LFM2.5 model: %s", exc)
            return False
        finally:
            self._loading = False

    def _map_lfm_label_to_tag(self, label: str) -> str:
        """Map LFM2.5 40+ fine-grained labels to standard VARMA tags."""
        l = label.lower()
        if "person_name" in l or "name" in l:
            return "PERSON_NAME"
        if "credit_card" in l or "bank" in l or "iban" in l or "crypto" in l or "amount" in l:
            return "FINANCIAL"
        if "email" in l or "phone" in l or "address" in l or "postal" in l or "ip_address" in l:
            return "CONTACT"
        if "password" in l or "api_key" in l or "private_key" in l or "jwt" in l or "credential" in l:
            return "CREDENTIAL"
        if "national_id" in l or "ssn" in l or "passport" in l or "license" in l or "tax_id" in l:
            return "ID_NUMBER"
        if "medical" in l or "health" in l or "condition" in l:
            return "HEALTHCARE"
        if "gps" in l or "location" in l:
            return "COORDINATES"
        return "PII"

    def detect(self, text: str) -> list[PIISpan]:
        """Detect all PII entities in text using regex + LFM2.5."""
        if not text or not text.strip():
            return []

        spans: list[PIISpan] = []
        covered_ranges: list[tuple[int, int]] = []

        # 1. Deterministic high-precision regex pass
        for p in DETERMINISTIC_PATTERNS:
            for match in p["re"].finditer(text):
                start, end = match.span()
                if any(start < ce and end > cs for cs, ce in covered_ranges):
                    continue
                matched_str = text[start:end]
                spans.append(
                    PIISpan(
                        text=matched_str,
                        tag=p["tag"],
                        label=p["label"],
                        start=start,
                        end=end,
                        confidence=1.0,
                    )
                )
                covered_ranges.append((start, end))

        # 2. Neural LFM2.5 pass (if model is loaded)
        if self._loaded and self._decoder and self._model and self._tokenizer:
            try:
                # Process in sliding windows of 2500 chars with 200 char overlap, up to 15000 chars
                chunk_size = 2500
                overlap_size = 200
                stride = chunk_size - overlap_size
                text_len = min(len(text), 15000)

                for chunk_offset in range(0, text_len, stride):
                    chunk = text[chunk_offset : chunk_offset + chunk_size]
                    if not chunk.strip():
                        continue

                    raw_predictions = self._decoder.predict(chunk, self._tokenizer, self._model)

                    for item in raw_predictions:
                        label = ""
                        s_text = ""
                        c_start = 0
                        c_end = 0

                        if isinstance(item, dict):
                            label = item.get("label", item.get("type", "PII"))
                            s_text = item.get("text", "")
                            c_start = int(item.get("start", 0))
                            c_end = int(item.get("end", c_start + len(s_text)))
                        elif isinstance(item, (list, tuple)) and len(item) >= 3:
                            if isinstance(item[0], int) and isinstance(item[1], int):
                                c_start, c_end = item[0], item[1]
                                label = str(item[2])
                                s_text = chunk[c_start:c_end]
                            else:
                                s_text = str(item[0])
                                label = str(item[1])
                                c_start = chunk.find(s_text)
                                c_end = c_start + len(s_text) if c_start != -1 else 0

                        if not s_text and 0 <= c_start < c_end <= len(chunk):
                            s_text = chunk[c_start:c_end]

                        if not s_text or len(s_text.strip()) < 2:
                            continue

                        # Absolute document coordinates
                        abs_start = chunk_offset + c_start
                        abs_end = chunk_offset + c_end

                        # Avoid duplicate overlapping spans with existing matches
                        overlap = any(abs_start < ce and abs_end > cs for cs, ce in covered_ranges)
                        if not overlap:
                            tag = self._map_lfm_label_to_tag(label)
                            spans.append(
                                PIISpan(
                                    text=s_text,
                                    tag=tag,
                                    label=label,
                                    start=abs_start,
                                    end=abs_end,
                                    confidence=0.95,
                                )
                            )
                            covered_ranges.append((abs_start, abs_end))
            except Exception as exc:
                logger.warning("LFM2.5 prediction error: %s", exc)

        # Sort spans by starting index
        spans.sort(key=lambda s: s.start)

        # Merge adjacent spans of the same tag separated only by whitespace (e.g. First Name + Last Name)
        merged_spans: list[PIISpan] = []
        for s in spans:
            if (
                merged_spans
                and merged_spans[-1].tag == s.tag
                and s.start >= merged_spans[-1].end
                and (s.start - merged_spans[-1].end) <= 3
                and text[merged_spans[-1].end : s.start].strip() == ""
            ):
                prev = merged_spans[-1]
                merged_text = text[prev.start : s.end]
                merged_spans[-1] = PIISpan(
                    text=merged_text,
                    tag=prev.tag,
                    label=prev.label,
                    start=prev.start,
                    end=s.end,
                    confidence=min(prev.confidence, s.confidence),
                )
            else:
                merged_spans.append(s)

        return merged_spans


# Global detector instance
detector = LFM25PIIDetector()
