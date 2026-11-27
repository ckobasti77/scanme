// Generisano: node scripts/fair/auto-expo-slider-assets.mjs — ne menjati ručno.
/** `box`: the car in a studio render, fractions [x0, y0, x1, y1] of the image (scripts/fair/auto-expo-slider-assets.mjs). */
export type FairGallerySlide = { src: string; width: number; height: number; box?: readonly [number, number, number, number] };
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
            "height": 900,
            "box": [
              0.206,
              0.267,
              0.791,
              0.894
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.154,
              0.248,
              0.877,
              0.871
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.063,
              0.243,
              0.95,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.115,
              0.213,
              0.889,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.213,
              0.212,
              0.813,
              0.853
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.294,
              0.181,
              0.69,
              0.852
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.123,
              0.156,
              0.853,
              0.941
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.119,
              0.109,
              0.861,
              0.963
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/crna/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.293,
              0.218,
              0.726,
              0.846
            ]
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
            "height": 900,
            "box": [
              0.206,
              0.267,
              0.791,
              0.894
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.154,
              0.248,
              0.877,
              0.871
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.063,
              0.243,
              0.95,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.115,
              0.213,
              0.889,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.213,
              0.212,
              0.813,
              0.853
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.294,
              0.181,
              0.69,
              0.852
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.123,
              0.156,
              0.853,
              0.941
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.119,
              0.109,
              0.861,
              0.963
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/bela/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.293,
              0.218,
              0.726,
              0.846
            ]
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
            "height": 900,
            "box": [
              0.206,
              0.267,
              0.791,
              0.894
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.154,
              0.248,
              0.877,
              0.871
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.063,
              0.243,
              0.95,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.115,
              0.213,
              0.889,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.213,
              0.212,
              0.813,
              0.853
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.294,
              0.181,
              0.69,
              0.852
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.123,
              0.156,
              0.853,
              0.941
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.119,
              0.109,
              0.861,
              0.963
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/plava/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.293,
              0.218,
              0.726,
              0.846
            ]
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
            "height": 900,
            "box": [
              0.206,
              0.267,
              0.791,
              0.894
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.154,
              0.248,
              0.877,
              0.871
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.063,
              0.243,
              0.95,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.115,
              0.213,
              0.889,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.213,
              0.212,
              0.813,
              0.853
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.294,
              0.181,
              0.69,
              0.852
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.123,
              0.156,
              0.853,
              0.941
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.119,
              0.109,
              0.861,
              0.963
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/siva/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.293,
              0.218,
              0.726,
              0.846
            ]
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
            "height": 900,
            "box": [
              0.206,
              0.267,
              0.791,
              0.894
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.154,
              0.248,
              0.877,
              0.871
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.063,
              0.243,
              0.95,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.115,
              0.213,
              0.889,
              0.836
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.213,
              0.212,
              0.813,
              0.853
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.294,
              0.181,
              0.69,
              0.852
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.123,
              0.156,
              0.853,
              0.941
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.119,
              0.109,
              0.861,
              0.963
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-kuga/zelena/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.293,
              0.218,
              0.726,
              0.846
            ]
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
            "height": 900,
            "box": [
              0.203,
              0.316,
              0.758,
              0.891
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.151,
              0.313,
              0.828,
              0.882
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.129,
              0.31,
              0.937,
              0.851
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.181,
              0.29,
              0.893,
              0.848
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.261,
              0.291,
              0.835,
              0.86
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.311,
              0.328,
              0.689,
              0.924
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.146,
              0.202,
              0.819,
              0.921
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.165,
              0.149,
              0.858,
              0.927
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/bela/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.305,
              0.318,
              0.696,
              0.892
            ]
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
            "height": 900,
            "box": [
              0.203,
              0.316,
              0.758,
              0.891
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.151,
              0.313,
              0.828,
              0.882
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.129,
              0.31,
              0.937,
              0.851
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.181,
              0.29,
              0.893,
              0.848
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.261,
              0.291,
              0.835,
              0.86
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.311,
              0.328,
              0.689,
              0.924
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.146,
              0.202,
              0.819,
              0.921
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.165,
              0.149,
              0.858,
              0.927
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crna/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.305,
              0.318,
              0.696,
              0.892
            ]
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
            "height": 900,
            "box": [
              0.203,
              0.316,
              0.758,
              0.891
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.151,
              0.313,
              0.828,
              0.882
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.129,
              0.31,
              0.937,
              0.851
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.181,
              0.29,
              0.893,
              0.848
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.261,
              0.291,
              0.835,
              0.86
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.311,
              0.328,
              0.689,
              0.924
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.146,
              0.202,
              0.819,
              0.921
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.165,
              0.149,
              0.858,
              0.927
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/crvena/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.305,
              0.318,
              0.696,
              0.892
            ]
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
            "height": 900,
            "box": [
              0.203,
              0.316,
              0.758,
              0.891
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.151,
              0.313,
              0.828,
              0.882
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.129,
              0.31,
              0.937,
              0.851
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.181,
              0.29,
              0.893,
              0.848
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.261,
              0.291,
              0.835,
              0.86
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.311,
              0.328,
              0.689,
              0.924
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.146,
              0.202,
              0.819,
              0.921
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.165,
              0.149,
              0.858,
              0.927
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/siva/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.305,
              0.318,
              0.696,
              0.892
            ]
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
            "height": 900,
            "box": [
              0.203,
              0.316,
              0.758,
              0.891
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/02.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.151,
              0.313,
              0.828,
              0.882
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/03.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.129,
              0.31,
              0.937,
              0.851
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/04.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.181,
              0.29,
              0.893,
              0.848
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/05.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.261,
              0.291,
              0.835,
              0.86
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/06.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.311,
              0.328,
              0.689,
              0.924
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/07.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.146,
              0.202,
              0.819,
              0.921
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/08.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.165,
              0.149,
              0.858,
              0.927
            ]
          },
          {
            "src": "/fair/auto-expo-2026/slider/ford-puma-mhev/svetlosiva/09.webp",
            "width": 1600,
            "height": 900,
            "box": [
              0.305,
              0.318,
              0.696,
              0.892
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.126,
              0.226,
              0.839,
              0.866
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.157,
              0.154,
              0.964,
              0.842
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
            "height": 900,
            "box": [
              0.067,
              0.188,
              0.998,
              0.92
            ]
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
