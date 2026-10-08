import { fairMapStand, type FairMapGeometry } from "./types";

// Sajam elektromobilnosti 2026 (9–11. 10.) — organizer maps captured
// 2026-10-07 (NOC-KONTEKST §2; sources in docs/sajam/mape/2026-10-07/).
// Polygons traced from the stand outlines in source-image pixels (outline
// pixels fitted per edge, then checked as an overlay); labels and m² are the
// organizer's. Working draft until the organizer confirms (V2 §6, §15).
//
//  - Hala: same layout as the 15. 9. map (only stand 12 changed hands), so
//    the polygons stay; two partner logos sit on the aisle edge.
//  - Ispred hale: a new drawing (1239×1080). Stands 12, 13 and 15 are split
//    into boxes with different exhibitors: each box is a location, the stand
//    label belongs to the group. 20–22 has no visible partitions: one
//    location. S1–S5 are not on this fair's map. Stand 14 is the ScanMe
//    stand (the organizer's map says "ENIGMA IT / ScanMe").
//  - Zadnji deo: one open area without stand numbers (the green outline).
export const ELEKTROMOBILNOST_2026_MAP: FairMapGeometry = {
  key: "elektromobilnost-2026",
  status: "draft",
  sourcePage: "https://sajamautomobila.com/ucesnici-2026/",
  capturedOn: "2026-10-07",
  zones: [
    {
      id: "hala",
      image: { src: "/sajam/mape/elektro-hala.jpg", width: 1375, height: 1080, organizerFile: "mapa-popunjena-0910-0710.jpg" },
      locations: [
        fairMapStand("hala-1a", "1A", [[464, 567], [618, 570], [616, 835], [460, 833], [459, 571]], { areaM2: 60 }),
        fairMapStand("hala-1b", "1B", [[808, 567], [887, 569], [885, 700], [620, 698], [622, 568]], { areaM2: 50 }),
        fairMapStand("hala-1c", "1C", [[622, 702], [885, 702], [887, 833], [622, 835]], { areaM2: 50 }),
        fairMapStand("hala-2", "2", [[500, 0], [980, 0], [1106, 108], [1157, 70], [1238, 164], [1332, 166], [1331, 402], [891, 404], [886, 512], [461, 512], [459, 219], [482, 218], [486, 211], [485, 5]], { areaM2: 490 }),
        fairMapStand("hala-5", "5", [[945, 406], [1370, 406], [1374, 410], [1371, 670], [945, 673]], { areaM2: 160 }),
        fairMapStand("hala-6", "6", [[945, 675], [1316, 675], [1316, 916], [1225, 915], [1157, 1012], [1116, 983], [981, 1079], [490, 1079], [486, 1075], [487, 891], [940, 891]], { areaM2: 275 }),
        fairMapStand("hala-9", "9", [[30, 797], [401, 797], [403, 968], [443, 973], [444, 1074], [439, 1079], [393, 1079], [262, 974], [214, 1016], [120, 915], [31, 916]], { areaM2: 110 }),
        fairMapStand("hala-10a", "10A", [[30, 608], [400, 608], [404, 621], [402, 793], [30, 795]], { areaM2: 98 }),
        fairMapStand("hala-10b", "10B", [[30, 352], [400, 352], [404, 375], [402, 604], [30, 606]], { areaM2: 132 }),
        fairMapStand("hala-11", "11", [[320, 60], [322, 160], [401, 165], [401, 350], [28, 348], [30, 164], [128, 163], [211, 75], [253, 109]], { areaM2: 120 }),
        fairMapStand("hala-12", "12", [[324, 57], [393, 0], [431, 0], [431, 108], [325, 108]], { areaM2: 14 }),
        // Partner logos on the aisle edge (Hotel Lotos by 10B, Restoran Vidovdan by 10A): points, not stands.
        { id: "hala-partner-10b", label: "uz 10B", kind: "partner", placement: "organizer", polygon: [[356, 389], [437, 389], [437, 445], [356, 445]] },
        { id: "hala-partner-10a", label: "uz 10A", kind: "partner", placement: "organizer", polygon: [[350, 636], [433, 636], [433, 686], [350, 686]] },
      ],
      landmarks: [
        { id: "hala-stepeniste-gore", kind: "stairs", polygon: [[444, 5], [485, 5], [485, 133], [444, 133]] },
        { id: "hala-stepeniste-dole", kind: "stairs", polygon: [[444, 945], [485, 945], [485, 1074], [444, 1074]] },
      ],
    },
    {
      id: "ispred",
      image: { src: "/sajam/mape/elektro-ispred.jpg", width: 1239, height: 1080, organizerFile: "mapa-popunjena-0910-ispred-0510-1.jpg" },
      groups: [
        { id: "ispred-12", label: "12", areaM2: 9 },
        { id: "ispred-13", label: "13", areaM2: 12 },
        { id: "ispred-15", label: "15", areaM2: 12 },
      ],
      locations: [
        fairMapStand("ispred-12-1", "12", [[322, 63], [462, 63], [462, 136], [322, 136]], { group: "ispred-12" }),
        fairMapStand("ispred-12-2", "12", [[462, 63], [602, 63], [602, 136], [462, 136]], { group: "ispred-12" }),
        // Column of 4 boxes, top to bottom; box 3 is empty (grey) on the organizer map.
        fairMapStand("ispred-13-1", "13", [[266, 188], [338, 202], [319, 297], [248, 283]], { group: "ispred-13" }),
        fairMapStand("ispred-13-2", "13", [[244, 287], [316, 302], [297, 397], [225, 383]], { group: "ispred-13" }),
        fairMapStand("ispred-13-3", "13", [[225, 387], [296, 401], [277, 497], [206, 482]], { group: "ispred-13" }),
        fairMapStand("ispred-13-4", "13", [[204, 488], [276, 502], [244, 653], [173, 638]], { group: "ispred-13" }),
        { id: "ispred-14", label: "14", kind: "scanme", placement: "organizer", areaM2: 3, polygon: [[406, 219], [503, 219], [503, 292], [406, 292]] },
        fairMapStand("ispred-15-1", "15", [[586, 231], [657, 216], [670, 278], [598, 293]], { group: "ispred-15" }),
        fairMapStand("ispred-15-2", "15", [[599, 298], [671, 283], [690, 379], [618, 393]], { group: "ispred-15" }),
        fairMapStand("ispred-15-3", "15", [[620, 398], [691, 384], [711, 479], [639, 494]], { group: "ispred-15" }),
        fairMapStand("ispred-15-4", "15", [[639, 497], [711, 483], [736, 606], [665, 621]], { group: "ispred-15" }),
        fairMapStand("ispred-16", "16", [[149, 722], [173, 727], [163, 775], [140, 770]], { areaM2: 1 }),
        fairMapStand("ispred-17", "17", [[318, 598], [591, 597], [591, 764], [318, 764]], { areaM2: 20 }),
        fairMapStand("ispred-18", "18", [[729, 700], [753, 695], [763, 743], [739, 748]], { areaM2: 1 }),
        fairMapStand("ispred-19", "19", [[112, 841], [184, 852], [181, 880], [281, 894], [271, 966], [97, 943]], { areaM2: 6 }),
        // 20 (3 m²) + 21 (6 m²) + 22 (3 m²): one L/J outline without visible partitions.
        fairMapStand("ispred-20-22", "20–22", [[463, 906], [568, 912], [777, 867], [756, 773], [827, 758], [863, 921], [580, 984], [459, 980]], { areaM2: 12 }),
      ],
      landmarks: [
        { id: "ispred-glavni-ulaz", kind: "entrance", polygon: [[344, 1005], [390, 1065], [289, 1057]] },
        { id: "ispred-totem", kind: "totem", polygon: [[442, 294], [468, 294], [468, 346], [442, 346]] },
        { id: "ispred-stepeniste", kind: "stairs", polygon: [[363, 343], [546, 343], [546, 597], [363, 597]] },
        { id: "ispred-parking", kind: "parking", polygon: [[242, 779], [674, 779], [674, 839], [242, 839]] },
      ],
    },
    {
      id: "zadnji-deo",
      image: { src: "/sajam/mape/elektro-zadnji-deo.jpg", width: 1920, height: 988, organizerFile: "mapa-zadnji-deo.jpg" },
      locations: [
        {
          id: "zadnji-deo",
          label: "Zadnji deo",
          kind: "area",
          placement: "organizer",
          polygon: [[2, 695], [354, 343], [734, 80], [936, 615], [1138, 557], [1009, 28], [1336, 2], [1623, 31], [1917, 122], [1796, 454], [1545, 381], [1463, 744], [873, 744], [666, 910], [609, 857], [489, 985], [345, 985]],
        },
      ],
      landmarks: [
        { id: "zadnji-deo-stepeniste-desno", kind: "stairs", polygon: [[1242, 317], [1389, 317], [1389, 521], [1242, 521]] },
        { id: "zadnji-deo-stepeniste-levo", kind: "stairs", polygon: [[511, 631], [655, 772], [551, 876], [409, 735]] },
        { id: "zadnji-deo-parking-desno", kind: "parking", polygon: [[1140, 127], [1483, 127], [1483, 177], [1140, 177]] },
        { id: "zadnji-deo-parking-levo", kind: "parking", polygon: [[313, 648], [427, 525], [456, 558], [341, 674]] },
      ],
    },
  ],
};
