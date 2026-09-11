import importlib.util
import sys
from pathlib import Path
from huggingface_hub import hf_hub_download

MODEL_ID = "LiquidAI/LFM2.5-Encoder-350M-PII-Detector"

print("Downloading helper files from HuggingFace...")
helper_path = hf_hub_download(MODEL_ID, "pii_hybrid_decode.py")
hf_hub_download(MODEL_ID, "context_cued.py")
helper_dir = str(Path(helper_path).parent)
if helper_dir not in sys.path:
    sys.path.insert(0, helper_dir)

spec = importlib.util.spec_from_file_location("pii_hybrid_decode", helper_path)
hd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hd)
print("Loaded pii_hybrid_decode successfully!")

print("Loading tokenizer and model...")
from transformers import AutoModelForTokenClassification, AutoTokenizer

tok = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
model = AutoModelForTokenClassification.from_pretrained(MODEL_ID, trust_remote_code=True).eval()
print("Model loaded successfully!")

sample = "My name is John Doe, email is john.doe@example.com, and phone is +1-555-123-4567. My Aadhaar number is 1234 5678 9012."
spans = hd.predict(sample, tok, model)
print("Detected spans:", spans)
