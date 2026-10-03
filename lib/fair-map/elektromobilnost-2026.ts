import { fairMapStand, type FairMapGeometry } from "./types";

// Sajam elektromobilnosti 2026 (9–11. 10.) — organizer maps captured 2026-09-30 (docs/sajam/mape/README.md).
// Polygons traced from the stand outlines in source-image pixels; labels are
// the organizer's stand labels. Working draft: every id must be re-checked
// against the organizer's current maps before the fair (V2 §6, §15).
export const ELEKTROMOBILNOST_2026_MAP: FairMapGeometry = {
  key: "elektromobilnost-2026",
  status: "draft",
  sourcePage: "https://sajamautomobila.com/ucesnici-2026/",
  capturedOn: "2026-09-30",
  zones: [
    {
      id: "hala",
      image: { src: "/sajam/mape/elektro-hala.jpg", width: 1375, height: 1080, organizerFile: "mapa-popunjena-0910-1509.jpg" },
      locations: [
        fairMapStand("hala-1a", "1A", [[464, 567], [618, 570], [616, 835], [460, 833], [459, 571]]),
        fairMapStand("hala-1b", "1B", [[808, 567], [887, 569], [885, 700], [620, 698], [622, 568]]),
        fairMapStand("hala-1c", "1C", [[622, 702], [885, 702], [887, 833], [622, 835]]),
        fairMapStand("hala-2", "2", [[500, 0], [980, 0], [1106, 108], [1157, 70], [1238, 164], [1332, 166], [1331, 402], [891, 404], [886, 512], [461, 512], [459, 219], [482, 218], [486, 211], [485, 5]]),
        fairMapStand("hala-5", "5", [[945, 406], [1370, 406], [1374, 410], [1371, 670], [945, 673]]),
        fairMapStand("hala-6", "6", [[945, 675], [1316, 675], [1316, 916], [1225, 915], [1157, 1012], [1116, 983], [981, 1079], [490, 1079], [486, 1075], [487, 891], [940, 891]]),
        fairMapStand("hala-9", "9", [[30, 797], [401, 797], [403, 968], [443, 973], [444, 1074], [439, 1079], [393, 1079], [262, 974], [214, 1016], [120, 915], [31, 916]]),
        fairMapStand("hala-10a", "10A", [[30, 608], [400, 608], [404, 621], [402, 793], [30, 795]]),
        fairMapStand("hala-10b", "10B", [[30, 352], [400, 352], [404, 375], [402, 604], [30, 606]]),
        fairMapStand("hala-11", "11", [[320, 60], [322, 160], [401, 165], [401, 350], [28, 348], [30, 164], [128, 163], [211, 75], [253, 109]]),
        fairMapStand("hala-12", "12", [[324, 57], [393, 0], [431, 0], [431, 108], [325, 108]]),
      ],
      landmarks: [
        { id: "hala-stepeniste-gore", kind: "stairs", polygon: [[444, 5], [485, 5], [485, 133], [444, 133]] },
        { id: "hala-stepeniste-dole", kind: "stairs", polygon: [[444, 945], [485, 945], [485, 1074], [444, 1074]] },
      ],
    },
    {
      id: "ispred",
      image: { src: "/sajam/mape/elektro-ispred.jpg", width: 1120, height: 1080, organizerFile: "mapa-popunjena-0910-2809.jpg" },
      locations: [
        fairMapStand("ispred-12", "12", [[238, 46], [438, 46], [440, 96], [238, 99]]),
        fairMapStand("ispred-13", "13", [[194, 137], [248, 147], [179, 478], [126, 467]]),
        fairMapStand("ispred-14", "14", [[299, 161], [365, 161], [368, 210], [300, 213]]),
        fairMapStand("ispred-15", "15", [[427, 163], [481, 153], [538, 444], [486, 455]]),
        fairMapStand("ispred-16", "16", [[111, 530], [125, 534], [117, 566], [103, 561]]),
        fairMapStand("ispred-17", "17", [[235, 438], [429, 438], [432, 556], [235, 558]]),
        fairMapStand("ispred-18", "18", [[535, 513], [550, 510], [557, 542], [543, 546]]),
        fairMapStand("ispred-19", "19", [[84, 617], [131, 623], [134, 645], [203, 655], [198, 704], [74, 689]]),
        fairMapStand("ispred-20", "20", [[341, 664], [410, 668], [410, 718], [340, 717], [337, 701]]),
        fairMapStand("ispred-21", "21", [[416, 668], [553, 641], [563, 688], [425, 718]]),
        fairMapStand("ispred-22", "22", [[553, 641], [630, 627], [631, 672], [563, 688]]),
        fairMapStand("ispred-s1", "S1", [[623, 811], [690, 938], [530, 1023], [463, 897]]),
        fairMapStand("ispred-s2", "S2", [[727, 758], [796, 884], [694, 939], [627, 812]]),
        fairMapStand("ispred-s3", "S3", [[914, 660], [981, 787], [799, 884], [731, 757]]),
        fairMapStand("ispred-s4", "S4", [[708, 994], [842, 994], [845, 1076], [709, 1079]]),
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
