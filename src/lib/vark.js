export const VARK_OPTION_GROUPS = [
  {
    title: "Single Preferences",
    options: [
      {
        value: "visual",
        label: "Visual",
        badge: "V",
        description: "Use this for Mild, Strong, or Very Strong Visual VARK results.",
      },
      {
        value: "aural",
        label: "Aural",
        badge: "A",
        description: "Use this for Mild, Strong, or Very Strong Aural VARK results.",
      },
      {
        value: "read_write",
        label: "Read/write",
        badge: "R",
        description: "Use this for Mild, Strong, or Very Strong Read/write VARK results.",
      },
      {
        value: "kinesthetic",
        label: "Kinesthetic",
        badge: "K",
        description: "Use this for Mild, Strong, or Very Strong Kinesthetic VARK results.",
      },
    ],
  },
  {
    title: "Bimodal Preferences",
    options: [
      {
        value: "va",
        label: "VA",
        badge: "VA",
        description: "Visual + Aural",
      },
      {
        value: "vr",
        label: "VR",
        badge: "VR",
        description: "Visual + Read/write",
      },
      {
        value: "vk",
        label: "VK",
        badge: "VK",
        description: "Visual + Kinesthetic",
      },
      {
        value: "ar",
        label: "AR",
        badge: "AR",
        description: "Aural + Read/write",
      },
      {
        value: "ak",
        label: "AK",
        badge: "AK",
        description: "Aural + Kinesthetic",
      },
      {
        value: "rk",
        label: "RK",
        badge: "RK",
        description: "Read/write + Kinesthetic",
      },
    ],
  },
  {
    title: "Trimodal Preferences",
    options: [
      {
        value: "var",
        label: "VAR",
        badge: "VAR",
        description: "Visual + Aural + Read/write",
      },
      {
        value: "vak",
        label: "VAK",
        badge: "VAK",
        description: "Visual + Aural + Kinesthetic",
      },
      {
        value: "vrk",
        label: "VRK",
        badge: "VRK",
        description: "Visual + Read/write + Kinesthetic",
      },
      {
        value: "ark",
        label: "ARK",
        badge: "ARK",
        description: "Aural + Read/write + Kinesthetic",
      },
    ],
  },
  {
    title: "Four-part Preferences",
    options: [
      {
        value: "vark",
        label: "VARK",
        badge: "VARK",
        description: "Use this for VARK, VARK Selective, or VARK Integrative results.",
      },
    ],
  },
];

export const VARK_OPTIONS = VARK_OPTION_GROUPS.flatMap((group) => group.options);

const VARK_LABELS = Object.fromEntries(
  VARK_OPTIONS.map((option) => [option.value, option.label])
);

const STYLE_LABELS = {
  visual: "Visual",
  aural: "Aural",
  "read-write": "Read/Write",
  kinesthetic: "Kinesthetic",
};

const VARK_STYLE_KEYS = {
  v: ["visual"],
  visual: ["visual"],
  mild_visual: ["visual"],
  strong_visual: ["visual"],
  very_strong_visual: ["visual"],
  a: ["aural"],
  aural: ["aural"],
  auditory: ["aural"],
  mild_aural: ["aural"],
  strong_aural: ["aural"],
  very_strong_aural: ["aural"],
  r: ["read-write"],
  read_write: ["read-write"],
  readwrite: ["read-write"],
  "read-write": ["read-write"],
  mild_read_write: ["read-write"],
  strong_read_write: ["read-write"],
  very_strong_read_write: ["read-write"],
  k: ["kinesthetic"],
  kinesthetic: ["kinesthetic"],
  mild_kinesthetic: ["kinesthetic"],
  strong_kinesthetic: ["kinesthetic"],
  very_strong_kinesthetic: ["kinesthetic"],
  va: ["visual", "aural"],
  vr: ["visual", "read-write"],
  vk: ["visual", "kinesthetic"],
  ar: ["aural", "read-write"],
  ak: ["aural", "kinesthetic"],
  rk: ["read-write", "kinesthetic"],
  var: ["visual", "aural", "read-write"],
  vak: ["visual", "aural", "kinesthetic"],
  vrk: ["visual", "read-write", "kinesthetic"],
  ark: ["aural", "read-write", "kinesthetic"],
  vark: ["visual", "aural", "read-write", "kinesthetic"],
  vark_selective: ["visual", "aural", "read-write", "kinesthetic"],
  vark_integrative: ["visual", "aural", "read-write", "kinesthetic"],
  multimodal: ["visual", "aural", "read-write", "kinesthetic"],
};

const LEGACY_VARK_LABELS = {
  visual: "Visual",
  aural: "Aural",
  read_write: "Read/write",
  kinesthetic: "Kinesthetic",
  mild_visual: "Visual",
  strong_visual: "Visual",
  very_strong_visual: "Visual",
  mild_aural: "Aural",
  strong_aural: "Aural",
  very_strong_aural: "Aural",
  mild_read_write: "Read/write",
  strong_read_write: "Read/write",
  very_strong_read_write: "Read/write",
  mild_kinesthetic: "Kinesthetic",
  strong_kinesthetic: "Kinesthetic",
  very_strong_kinesthetic: "Kinesthetic",
  vark_selective: "VARK",
  vark_integrative: "VARK",
  multimodal: "Multimodal",
};

const CANONICAL_VARK_VALUES = {
  mild_visual: "visual",
  strong_visual: "visual",
  very_strong_visual: "visual",
  mild_aural: "aural",
  strong_aural: "aural",
  very_strong_aural: "aural",
  mild_read_write: "read_write",
  strong_read_write: "read_write",
  very_strong_read_write: "read_write",
  mild_kinesthetic: "kinesthetic",
  strong_kinesthetic: "kinesthetic",
  very_strong_kinesthetic: "kinesthetic",
  vark_selective: "vark",
  vark_integrative: "vark",
  multimodal: "vark",
};

export function getVarkResultLabel(value) {
  const rawValue = String(value || "").trim();
  const normalizedValue = rawValue
    .toLowerCase()
    .replace(/read\s*\/?\s*write/g, "read_write")
    .replace(/[\s-]+/g, "_");
  const canonicalValue = getCanonicalVarkValue(rawValue);

  return (
    VARK_LABELS[canonicalValue] ||
    VARK_LABELS[rawValue] ||
    LEGACY_VARK_LABELS[normalizedValue] ||
    LEGACY_VARK_LABELS[rawValue] ||
    rawValue
  );
}

export function getCanonicalVarkValue(value = "") {
  const rawValue = String(value).trim();
  const normalizedValue = rawValue
    .toLowerCase()
    .replace(/read\s*\/?\s*write/g, "read_write")
    .replace(/[\s-]+/g, "_");

  return CANONICAL_VARK_VALUES[normalizedValue] || normalizedValue || rawValue;
}

export function getVarkStyleKeys(value = "") {
  const rawValue = String(value).toLowerCase().trim();
  const normalizedCode = rawValue
    .replace(/read\s*\/?\s*write/g, "read_write")
    .replace(/[\s-]+/g, "_");
  const normalizedText = rawValue
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const styleKeys = [];

  function addStyleKeys(keys) {
    keys.forEach((key) => {
      if (!styleKeys.includes(key)) {
        styleKeys.push(key);
      }
    });
  }

  if (VARK_STYLE_KEYS[normalizedCode]) {
    addStyleKeys(VARK_STYLE_KEYS[normalizedCode]);
  }

  if (/^[vark]+$/.test(rawValue)) {
    addStyleKeys(rawValue.split("").flatMap((part) => VARK_STYLE_KEYS[part] || []));
  }

  const delimitedCodeParts = rawValue.split(/[^a-z]+/).filter(Boolean);

  if (
    delimitedCodeParts.length > 1 &&
    delimitedCodeParts.every((part) => /^[vark]$/.test(part))
  ) {
    addStyleKeys(
      delimitedCodeParts.flatMap((part) => VARK_STYLE_KEYS[part] || [])
    );
  }

  if (/\bvisual\b|\bvisuals\b|\bvideo\b|\bdiagram/.test(normalizedText)) {
    addStyleKeys(["visual"]);
  }

  if (/\baural\b|\bauditory\b|\blisten|\bspeech|\bsound/.test(normalizedText)) {
    addStyleKeys(["aural"]);
  }

  if (
    /\bread\s*\/?\s*write\b|\breadwrite\b|\breading\b|\btext\b|\bnotes\b/.test(
      normalizedText
    )
  ) {
    addStyleKeys(["read-write"]);
  }

  if (
    /\bkinesthetic\b|\bpractical\b|\bhands-on\b|\bactivity/.test(normalizedText)
  ) {
    addStyleKeys(["kinesthetic"]);
  }

  return styleKeys;
}

export function getVarkStyleLabel(value) {
  const styleKeys = getVarkStyleKeys(value);

  if (styleKeys.length === 0) {
    return "Not set";
  }

  return styleKeys.map((styleKey) => STYLE_LABELS[styleKey]).join(" + ");
}
