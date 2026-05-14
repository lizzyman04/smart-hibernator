"""
Generate src/assets/classifier.onnx — synthetic Decision Tree ONNX model for tab vitality classification.

This is a ONE-TIME offline script. Run it locally to regenerate the ONNX artifact:
    pip install scikit-learn skl2onnx onnx numpy
    python scripts/generate-model.py

The resulting src/assets/classifier.onnx is committed to the repository.
Downstream waves (03-02+) consume the committed binary — Python is NOT needed at runtime.

Model architecture:
  - 6 float32 input features per tab (see feature vector design in 03-RESEARCH.md Pattern 3)
  - 3 output classes: 0=Dead, 1=Semi-Active, 2=Vital
  - Decision Tree, max_depth=5, trained on ~600 synthetic rule-based samples

Feature vector (index order):
  [0] revisitFreq     — normalized visits in 14 days (0-1, max=30 visits)
  [1] dwellTime       — normalized avg dwell per visit (0-1, max=3600 seconds)
  [2] formActivity    — 0 or 1 (had form input in last session)
  [3] categoryBoost   — domain category preset: -1=dead, 0=neutral, +1=vital
  [4] biasOffset      — per-domain learned offset (-1 to +1)
  [5] recency         — normalized hours since last visit (0-1, max=336 = 14 days)

Labels: 0=Dead, 1=Semi-Active, 2=Vital
"""
import os
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Deterministic RNG — seed=42 ensures reproducible .onnx output
rng = np.random.default_rng(seed=42)

N = 600  # total synthetic samples: 200 per class

# ── Helper to generate samples with label-conditioned rules ──────────────────
def make_vital(n: int) -> tuple[np.ndarray, np.ndarray]:
    """High revisit, long dwell, often form activity, positive category boost."""
    revisit  = rng.uniform(0.6, 1.0, n)
    dwell    = rng.uniform(0.4, 1.0, n)
    form     = rng.choice([0, 1], n, p=[0.3, 0.7])
    boost    = rng.uniform(0.3, 1.0, n)
    bias     = rng.uniform(0.0, 1.0, n)
    recency  = rng.uniform(0.0, 0.3, n)  # visited recently (low recency value)
    X = np.stack([revisit, dwell, form, boost, bias, recency], axis=1)
    y = np.full(n, 2)
    return X, y


def make_semi_active(n: int) -> tuple[np.ndarray, np.ndarray]:
    """Moderate values across all dimensions."""
    revisit  = rng.uniform(0.2, 0.7, n)
    dwell    = rng.uniform(0.1, 0.5, n)
    form     = rng.choice([0, 1], n, p=[0.6, 0.4])
    boost    = rng.uniform(-0.2, 0.5, n)
    bias     = rng.uniform(-0.3, 0.3, n)
    recency  = rng.uniform(0.2, 0.6, n)
    X = np.stack([revisit, dwell, form, boost, bias, recency], axis=1)
    y = np.full(n, 1)
    return X, y


def make_dead(n: int) -> tuple[np.ndarray, np.ndarray]:
    """Low revisit, short dwell, no form activity, negative category boost, stale recency."""
    revisit  = rng.uniform(0.0, 0.3, n)
    dwell    = rng.uniform(0.0, 0.2, n)
    form     = rng.choice([0, 1], n, p=[0.9, 0.1])
    boost    = rng.uniform(-1.0, 0.1, n)
    bias     = rng.uniform(-1.0, 0.0, n)
    recency  = rng.uniform(0.5, 1.0, n)  # visited a long time ago
    X = np.stack([revisit, dwell, form, boost, bias, recency], axis=1)
    y = np.full(n, 0)
    return X, y


# ── Build dataset ────────────────────────────────────────────────────────────
X_vital,  y_vital  = make_vital(N // 3)
X_semi,   y_semi   = make_semi_active(N // 3)
X_dead,   y_dead   = make_dead(N // 3)

X_train = np.vstack([X_vital, X_semi, X_dead]).astype(np.float32)
y_train = np.concatenate([y_vital, y_semi, y_dead]).astype(np.int64)

# Shuffle
idx = rng.permutation(len(X_train))
X_train = X_train[idx]
y_train = y_train[idx]

# ── Train Decision Tree ───────────────────────────────────────────────────────
clf = DecisionTreeClassifier(max_depth=5, random_state=42)
clf.fit(X_train, y_train)

# ── Export to ONNX ────────────────────────────────────────────────────────────
# FloatTensorType([None, 6]) — batch dimension is dynamic; 6 input features
# zipmap=False — emit raw float32 probability array instead of ZipMap dict
# (RESEARCH.md Pitfall 7: ORT-Web's JS output_probability is a tensor, not a dict)
initial_types = [('float_input', FloatTensorType([None, 6]))]
onx = convert_sklearn(clf, initial_types=initial_types, options={id(clf): {'zipmap': False}})

out_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'classifier.onnx')
out_path = os.path.normpath(out_path)
os.makedirs(os.path.dirname(out_path), exist_ok=True)

with open(out_path, 'wb') as f:
    f.write(onx.SerializeToString())

size = os.path.getsize(out_path)
print(f"classifier.onnx written to: {out_path}")
print(f"File size: {size} bytes ({size / 1024:.1f} KB)")
assert size < 100 * 1024, f"ONNX model too large ({size} bytes > 100 KB limit)"
print("OK — model is within 100 KB size limit.")
