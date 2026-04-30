export const VARK_OPTION_GROUPS = [
  {
    title: "Single Preferences",
    options: [
      {
        value: "mild_visual",
        label: "Mild Visual",
        badge: "V",
        description: "A visual preference with moderate emphasis on diagrams, maps, and patterns.",
      },
      {
        value: "strong_visual",
        label: "Strong Visual",
        badge: "V",
        description: "A clearly visual preference for charts, layout, symbols, and graphic structure.",
      },
      {
        value: "very_strong_visual",
        label: "Very Strong Visual",
        badge: "V",
        description: "A highly visual preference centered on diagrams, spatial patterns, and design.",
      },
      {
        value: "mild_aural",
        label: "Mild Aural",
        badge: "A",
        description: "An aural preference with moderate emphasis on listening, discussion, and explanation.",
      },
      {
        value: "strong_aural",
        label: "Strong Aural",
        badge: "A",
        description: "A clearly aural preference for spoken discussion, questions, and hearing ideas aloud.",
      },
      {
        value: "very_strong_aural",
        label: "Very Strong Aural",
        badge: "A",
        description: "A highly aural preference centered on listening, talking, and verbal exchange.",
      },
      {
        value: "mild_read_write",
        label: "Mild Read/write",
        badge: "R",
        description: "A read/write preference with moderate emphasis on notes, text, and written summaries.",
      },
      {
        value: "strong_read_write",
        label: "Strong Read/write",
        badge: "R",
        description: "A clearly read/write preference for manuals, lists, reading, and writing.",
      },
      {
        value: "very_strong_read_write",
        label: "Very Strong Read/write",
        badge: "R",
        description: "A highly read/write preference centered on text-heavy learning and written processing.",
      },
      {
        value: "mild_kinesthetic",
        label: "Mild Kinesthetic",
        badge: "K",
        description: "A kinesthetic preference with moderate emphasis on examples, cases, and practical activity.",
      },
      {
        value: "strong_kinesthetic",
        label: "Strong Kinesthetic",
        badge: "K",
        description: "A clearly kinesthetic preference for doing, practicing, and real-world application.",
      },
      {
        value: "very_strong_kinesthetic",
        label: "Very Strong Kinesthetic",
        badge: "K",
        description: "A highly kinesthetic preference centered on hands-on experience and concrete examples.",
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
        description: "All four modalities are included in your preference.",
      },
      {
        value: "vark_selective",
        label: "VARK (Selective)",
        badge: "VARK",
        description: "You select among all four modes depending on the context.",
      },
      {
        value: "vark_integrative",
        label: "VARK (Integrative)",
        badge: "VARK",
        description: "You prefer combining all four modes together when learning.",
      },
    ],
  },
];

export const VARK_OPTIONS = VARK_OPTION_GROUPS.flatMap((group) => group.options);

const VARK_LABELS = Object.fromEntries(
  VARK_OPTIONS.map((option) => [option.value, option.label])
);

const LEGACY_VARK_LABELS = {
  visual: "Visual",
  aural: "Aural",
  read_write: "Read/write",
  kinesthetic: "Kinesthetic",
  multimodal: "Multimodal",
};

export function getVarkResultLabel(value) {
  return VARK_LABELS[value] || LEGACY_VARK_LABELS[value] || value;
}
