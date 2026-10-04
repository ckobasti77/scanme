import { fairMapStand, type FairMapGeometry } from "./types";

// Auto Moto Fest 2026 (30. 10.–1. 11.) — organizer maps captured 2026-09-30 (docs/sajam/mape/README.md).
// Polygons traced from the stand outlines in source-image pixels; labels are
// the organizer's stand labels. Working draft: every id must be re-checked
// against the organizer's current maps before the fair (V2 §6, §15).
export const AUTO_MOTO_FEST_2026_MAP: FairMapGeometry = {
  key: "auto-moto-fest-2026",
  status: "draft",
  sourcePage: "https://sajamautomobila.com/ucesnici-2026/",
  capturedOn: "2026-09-30",
  zones: [
    {
      id: "hala",
      image: { src: "/sajam/mape/amf-hala.jpg", width: 1375, height: 1080, organizerFile: "mapa-popunjena-3010-2409.jpg" },
      locations: [
        fairMapStand("hala-1", "1", [[463, 567], [886, 567], [888, 833], [462, 835], [459, 570]]),
        fairMapStand("hala-2", "2", [[578, 0], [858, 0], [862, 4], [861, 214], [888, 219], [886, 512], [459, 510], [459, 220], [482, 217], [486, 210], [485, 5]]),
        fairMapStand("hala-3", "3", [[868, 0], [980, 0], [1104, 107], [1158, 71], [1238, 163], [1329, 163], [1331, 402], [945, 404], [943, 219], [934, 215], [863, 214], [863, 5]]),
        fairMapStand("hala-5", "5", [[945, 406], [1370, 406], [1374, 410], [1371, 670], [945, 673]]),
        fairMapStand("hala-6-7", "6-7", [[945, 675], [1316, 675], [1315, 916], [1225, 916], [1157, 1012], [1116, 983], [981, 1079], [489, 1079], [485, 1075], [488, 891], [940, 891]]),
        fairMapStand("hala-8", "8", [[30, 797], [401, 797], [405, 969], [443, 974], [447, 990], [443, 1001], [444, 1075], [440, 1079], [394, 1079], [262, 975], [215, 1016], [122, 916], [32, 916]]),
        fairMapStand("hala-9", "9", [[30, 541], [400, 541], [404, 568], [402, 793], [30, 795]]),
        fairMapStand("hala-10", "10", [[320, 60], [322, 159], [326, 163], [399, 163], [402, 168], [403, 536], [30, 538], [28, 166], [128, 163], [210, 76], [253, 109]]),
        fairMapStand("hala-11", "11", [[324, 57], [393, 0], [431, 0], [431, 108], [325, 108]]),
      ],
      landmarks: [
        { id: "hala-stepeniste-gore", kind: "stairs", polygon: [[444, 5], [485, 5], [485, 133], [444, 133]] },
        { id: "hala-stepeniste-dole", kind: "stairs", polygon: [[444, 945], [485, 945], [485, 1074], [444, 1074]] },
      ],
    },
    {
      id: "ispred",
      image: { src: "/sajam/mape/amf-ispred.jpg", width: 1120, height: 1080, organizerFile: "mapa-popunjena-3010-ispred-2809.jpg" },
      locations: [
        fairMapStand("ispred-12", "12", [[238, 46], [437, 46], [440, 96], [238, 98]]),
        fairMapStand("ispred-13", "13", [[194, 137], [248, 147], [179, 478], [126, 467]]),
        fairMapStand("ispred-14", "14", [[299, 161], [365, 161], [368, 210], [300, 213]]),
        fairMapStand("ispred-15", "15", [[427, 163], [481, 153], [538, 444], [486, 455]]),
        fairMapStand("ispred-16", "16", [[111, 529], [125, 533], [118, 566], [103, 562]]),
        fairMapStand("ispred-17", "17", [[235, 437], [430, 438], [432, 556], [235, 558]]),
        fairMapStand("ispred-18", "18", [[535, 513], [550, 510], [557, 542], [543, 546]]),
        fairMapStand("ispred-19", "19", [[83, 617], [132, 623], [135, 645], [203, 655], [198, 704], [74, 690]]),
        fairMapStand("ispred-20", "20", [[341, 663], [411, 668], [410, 718], [339, 718], [336, 712]]),
        fairMapStand("ispred-21", "21", [[416, 668], [553, 641], [563, 688], [425, 718]]),
        fairMapStand("ispred-22", "22", [[553, 641], [630, 627], [631, 672], [563, 688]]),
        fairMapStand("ispred-s1-s2", "S1/S2", [[727, 757], [796, 884], [530, 1024], [463, 897]]),
        fairMapStand("ispred-s3", "S3", [[914, 660], [981, 788], [800, 883], [731, 757]]),
        fairMapStand("ispred-s4", "S4", [[707, 993], [843, 993], [846, 1076], [708, 1079]]),
        fairMapStand("ispred-s5", "S5", [[927, 944], [1119, 944], [1119, 1079], [928, 1079]]),
        // Not on the organizer map: the ScanMe stand position is still open
        // (old 30.9 notes only say "ulaz"). Placeholder near the main entrance.
        { id: "scanme", label: "ScanMe", kind: "scanme", placement: "placeholder", polygon: [[60, 782], [150, 782], [150, 818], [60, 818]] },
      ],
      landmarks: [
        { id: "ispred-glavni-ulaz", kind: "entrance", polygon: [[212, 768], [249, 736], [285, 778]] },
        { id: "ispred-stepeniste", kind: "stairs", polygon: [[266, 251], [399, 251], [399, 436], [266, 436]] },
      ],
    },
  ],
};
