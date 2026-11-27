// Generisano: node scripts/fair/auto-expo-slider-assets.mjs — ne menjati ručno.
export type FairGallerySlide = { src: string; width: number; height: number };
export type FairGalleryGroup = { id: string; label: string; swatch: string; slides: readonly FairGallerySlide[] };
/** "angles": swatch bira boju, slajdovi su uglovi te boje. "colors": svaka boja je slajd, `extra` ide posle boja. */
export type FairModelGallery = { mode: "angles" | "colors"; groups: readonly FairGalleryGroup[]; extra: readonly FairGallerySlide[] };
export const AUTO_EXPO_2026_GALLERY: Readonly<Record<string, FairModelGallery>> = {
  "ford-kuga": {
    "mode": "angles",
    "groups": [
      {
        "id": "crna",
        "label": "Crna",
        "swatch": "#17181a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "bela",
        "label": "Bela",
        "swatch": "#f1f1ee",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "plava",
        "label": "Plava",
        "swatch": "#1d4ea0",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "siva",
        "label": "Siva",
        "swatch": "#6e7378",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "zelena",
        "label": "Zelena",
        "swatch": "#4d5c45",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      }
    ],
    "extra": []
  },
  "ford-puma-mhev": {
    "mode": "angles",
    "groups": [
      {
        "id": "bela",
        "label": "Bela",
        "swatch": "#f1f1ee",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crna",
        "label": "Crna",
        "swatch": "#17181a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crvena",
        "label": "Crvena",
        "swatch": "#a8201a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "siva",
        "label": "Siva",
        "swatch": "#6e7378",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "svetlosiva",
        "label": "Svetlosiva",
        "swatch": "#b8bbbe",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/01.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/02.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/03.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/04.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/05.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/06.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/07.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/08.webp",
            "width": 1600,
            "height": 900
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/09.webp",
            "width": 1600,
            "height": 900
          }
        ]
      }
    ],
    "extra": []
  },
  "mg3": {
    "mode": "colors",
    "groups": [
      {
        "id": "bela",
        "label": "Bela",
        "swatch": "#f1f1ee",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/bela.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crna",
        "label": "Crna",
        "swatch": "#17181a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/crna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "siva",
        "label": "Siva",
        "swatch": "#6e7378",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/siva.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "srebrna",
        "label": "Srebrna",
        "swatch": "#c3c6c9",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/srebrna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "plava",
        "label": "Plava",
        "swatch": "#1d4ea0",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/plava.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crvena",
        "label": "Crvena",
        "swatch": "#a8201a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/crvena.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "zuta",
        "label": "Žuta",
        "swatch": "#e9c12a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg3/boje/zuta.webp",
            "width": 1600,
            "height": 900
          }
        ]
      }
    ],
    "extra": []
  },
  "mg-hs-hybrid": {
    "mode": "colors",
    "groups": [
      {
        "id": "srebrna",
        "label": "Srebrna",
        "swatch": "#c3c6c9",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/srebrna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "bela",
        "label": "Bela",
        "swatch": "#f1f1ee",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/bela.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crna",
        "label": "Crna",
        "swatch": "#17181a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/crna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "siva",
        "label": "Siva",
        "swatch": "#6e7378",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/siva.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "plava",
        "label": "Plava",
        "swatch": "#1d4ea0",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/plava.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crvena",
        "label": "Crvena",
        "swatch": "#a8201a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-hs-hybrid/boje/crvena.webp",
            "width": 1600,
            "height": 900
          }
        ]
      }
    ],
    "extra": []
  },
  "mg-zs-hybrid": {
    "mode": "colors",
    "groups": [
      {
        "id": "crvena",
        "label": "Crvena",
        "swatch": "#a8201a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/crvena.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "bela",
        "label": "Bela",
        "swatch": "#f1f1ee",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/bela.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "crna",
        "label": "Crna",
        "swatch": "#17181a",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/crna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "siva",
        "label": "Siva",
        "swatch": "#6e7378",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/siva.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "srebrna",
        "label": "Srebrna",
        "swatch": "#c3c6c9",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/srebrna.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "plava",
        "label": "Plava",
        "swatch": "#1d4ea0",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/plava.webp",
            "width": 1600,
            "height": 900
          }
        ]
      },
      {
        "id": "zelena",
        "label": "Zelena",
        "swatch": "#4d5c45",
        "slides": [
          {
            "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/boje/zelena.webp",
            "width": 1600,
            "height": 900
          }
        ]
      }
    ],
    "extra": [
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/01.webp",
        "width": 1600,
        "height": 1066
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/02.webp",
        "width": 1600,
        "height": 1073
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/03.webp",
        "width": 1600,
        "height": 1067
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/04.webp",
        "width": 1600,
        "height": 1067
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/05.webp",
        "width": 1600,
        "height": 900
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/06.webp",
        "width": 1600,
        "height": 1067
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/07.webp",
        "width": 1600,
        "height": 1066
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/08.webp",
        "width": 1600,
        "height": 1067
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/09.webp",
        "width": 1600,
        "height": 1066
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/10.webp",
        "width": 1600,
        "height": 1066
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/11.webp",
        "width": 1600,
        "height": 1066
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/galerija/12.webp",
        "width": 1600,
        "height": 900
      },
      {
        "src": "/fair/auto-expo-2026/slider/mg-zs-hybrid/profil.webp",
        "width": 1600,
        "height": 800
      }
    ]
  }
};
