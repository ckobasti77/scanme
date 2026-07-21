#target illustrator

(function () {
  var previousInteractionLevel = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var MM = 72 / 25.4;
  var CARD_W = 85 * MM;
  var CARD_H = 55 * MM;
  var BLEED = 3 * MM;
  var PDF_BLEED = 9;
  var ARTWORK_BLEED = PDF_BLEED;
  var ARTBOARD_GAP = 18 * MM;
  var SECOND_LEFT = CARD_W + ARTBOARD_GAP;

  var root = "C:/My Stuff/Posao/ScanMe/Site/scanme";
  var output = root + "/output/business-card-template";
  var qrSvgPath = root + "/output/business-card-concept/scanme-qr-vector.svg";
  var patternSvgPath = root + "/output/business-card-concept/scanme-tonal-pattern.svg";
  var aiPath = output + "/ScanMe-Business-Card-Template.ai";
  var pdfPath = root + "/output/pdf/ScanMe-Business-Card-Print.pdf";
  var frontPngPath = output + "/ScanMe-Business-Card-Front";
  var backPngPath = output + "/ScanMe-Business-Card-Back";
  var logPath = output + "/template-build.log";

  function log(message) {
    var file = new File(logPath);
    file.encoding = "UTF-8";
    file.open("a");
    file.writeln(new Date().toString() + " | " + message);
    file.close();
  }

  var initialLog = new File(logPath);
  if (initialLog.exists) initialLog.remove();
  log("Build started");

  function mm(value) {
    return value * MM;
  }

  function cmyk(c, m, y, k) {
    var color = new CMYKColor();
    color.cyan = c;
    color.magenta = m;
    color.yellow = y;
    color.black = k;
    return color;
  }

  var PAPER = cmyk(3, 3, 8, 5);
  var INK = cmyk(55, 34, 43, 78);
  var QR_BLACK = cmyk(0, 0, 0, 100);
  var LIME = cmyk(24, 0, 78, 0);
  var MUTED = cmyk(22, 12, 18, 48);
  var GUIDE_BLEED = cmyk(0, 100, 0, 0);
  var GUIDE_SAFE = cmyk(100, 0, 0, 0);

  function artLeft(side) {
    return side === 0 ? 0 : SECOND_LEFT;
  }

  function x(side, valueMm) {
    return artLeft(side) + mm(valueMm);
  }

  function y(valueMm) {
    return mm(valueMm);
  }

  function font(primary, fallback) {
    try {
      return app.textFonts.getByName(primary);
    } catch (error) {
      return app.textFonts.getByName(fallback);
    }
  }

  var FONT_BOLD = font("AcuminConcept-Bold", "Arial-BoldMT");
  var FONT_REGULAR = font("AcuminConcept-Regular", "ArialMT");

  var preset = new DocumentPreset();
  preset.title = "ScanMe Business Card Template";
  preset.width = CARD_W;
  preset.height = CARD_H;
  preset.numArtboards = 2;
  preset.artboardLayout = DocumentArtboardLayout.Row;
  preset.artboardSpacing = ARTBOARD_GAP;
  preset.artboardRowsOrCols = 1;
  preset.colorMode = DocumentColorSpace.CMYK;
  preset.units = RulerUnits.Millimeters;
  preset.rasterResolution = DocumentRasterResolution.HighResolution;
  preset.documentBleedLink = true;
  preset.documentBleedOffset = [BLEED, BLEED, BLEED, BLEED];

  var doc = app.documents.addDocument("Print", preset);
  doc.artboards[0].artboardRect = [0, CARD_H, CARD_W, 0];
  doc.artboards[0].name = "FRONT - QR";
  doc.artboards[1].artboardRect = [SECOND_LEFT, CARD_H, SECOND_LEFT + CARD_W, 0];
  doc.artboards[1].name = "BACK - CONTACT";
  log("CMYK document and two artboards created");

  function addLayer(name) {
    var layer = doc.layers.add();
    layer.name = name;
    return layer;
  }

  var backgroundLayer = doc.layers[0];
  backgroundLayer.name = "01_BACKGROUND";
  var patternLayer = addLayer("02_OPTIONAL_TONAL_PATTERN_OR_DEBOSS");
  var signalLayer = addLayer("03_SIGNAL_LINE_AND_NODES");
  var qrLayer = addLayer("04_FUNCTIONAL_QR_VECTOR");
  var wordmarkLayer = addLayer("05_WORDMARK");
  var textLayer = addLayer("06_EDITABLE_TEXT");
  var guidesLayer = addLayer("99_GUIDES_DO_NOT_PRINT");

  function addSwatch(name, color) {
    var swatch = doc.swatches.add();
    swatch.name = name;
    swatch.color = color;
  }

  addSwatch("ScanMe Paper CMYK", PAPER);
  addSwatch("ScanMe Ink CMYK", INK);
  addSwatch("ScanMe QR Black K100", QR_BLACK);
  addSwatch("ScanMe Lime CMYK", LIME);
  addSwatch("ScanMe Muted CMYK", MUTED);

  function stylePath(item, fillColor, strokeColor, strokeWidth) {
    item.filled = fillColor !== null;
    if (fillColor !== null) item.fillColor = fillColor;
    item.stroked = strokeColor !== null;
    if (strokeColor !== null) {
      item.strokeColor = strokeColor;
      item.strokeWidth = strokeWidth;
    }
    return item;
  }

  function addBackground(side) {
    var item = backgroundLayer.pathItems.rectangle(
      CARD_H + ARTWORK_BLEED,
      artLeft(side) - ARTWORK_BLEED,
      CARD_W + ARTWORK_BLEED * 2,
      CARD_H + ARTWORK_BLEED * 2
    );
    item.name = side === 0 ? "Front background with bleed" : "Back background with bleed";
    stylePath(item, PAPER, null, 0);
  }

  addBackground(0);
  addBackground(1);
  log("Bleed backgrounds created");

  function addTonalPattern(side) {
    var source = new File(patternSvgPath);
    if (!source.exists) throw new Error("Missing tonal pattern SVG: " + patternSvgPath);
    var group = patternLayer.groupItems.createFromFile(source);
    group.name = side === 0 ? "Front optional tonal pattern" : "Back optional tonal pattern";
    group.width = CARD_W + ARTWORK_BLEED * 2;
    group.height = CARD_H + ARTWORK_BLEED * 2;
    group.left = artLeft(side) - ARTWORK_BLEED;
    group.top = CARD_H + ARTWORK_BLEED;
  }

  addTonalPattern(0);
  addTonalPattern(1);
  log("Optional vector tonal pattern placed");

  function addPointText(layer, contents, side, xMm, yMm, sizePt, textFont, color, tracking) {
    var frame = layer.textFrames.pointText([x(side, xMm), y(yMm)]);
    frame.contents = contents;
    frame.textRange.characterAttributes.textFont = textFont;
    frame.textRange.characterAttributes.size = sizePt;
    frame.textRange.characterAttributes.fillColor = color;
    frame.textRange.characterAttributes.tracking = tracking || 0;
    return frame;
  }

  function addCenteredText(layer, contents, side, centerMm, yMm, sizePt, textFont, color, tracking) {
    var frame = addPointText(layer, contents, side, 0, yMm, sizePt, textFont, color, tracking);
    app.redraw();
    frame.left = x(side, centerMm) - frame.width / 2;
    return frame;
  }

  function addWordmark(side, centerMm, baselineMm, sizePt) {
    var frame = wordmarkLayer.textFrames.pointText([x(side, centerMm), y(baselineMm)]);
    frame.contents = "ScanMe";
    frame.name = "ScanMe wordmark - M and e share Regular weight - no dot";
    frame.textRange.characterAttributes.textFont = FONT_REGULAR;
    frame.textRange.characterAttributes.size = sizePt;
    frame.textRange.characterAttributes.fillColor = INK;
    frame.textRange.characterAttributes.tracking = -35;
    frame.textRange.paragraphAttributes.justification = Justification.CENTER;
    for (var i = 0; i < 4; i += 1) {
      frame.characters[i].characterAttributes.textFont = FONT_BOLD;
    }
  }

  addWordmark(0, 42.5, 46.0, 17);

  function addBezier(layer, side, specs, strokeColor, strokeWidthMm, name) {
    var item = layer.pathItems.add();
    item.name = name;
    item.filled = false;
    item.stroked = true;
    item.strokeColor = strokeColor;
    item.strokeWidth = mm(strokeWidthMm);
    try {
      item.strokeCap = StrokeCap.ROUNDENDCAP;
      item.strokeJoin = StrokeJoin.ROUNDENDJOIN;
    } catch (error) {}

    for (var i = 0; i < specs.length; i += 1) {
      var spec = specs[i];
      var point = item.pathPoints.add();
      point.anchor = [x(side, spec[0]), y(spec[1])];
      point.leftDirection = [x(side, spec[2]), y(spec[3])];
      point.rightDirection = [x(side, spec[4]), y(spec[5])];
      point.pointType = PointType.SMOOTH;
    }
    item.closed = false;
    return item;
  }

  var frontCurve = [
    [10, 48, 10, 48, 14, 42],
    [18, 29, 16, 36, 20, 22],
    [29, 15, 24, 15, 31, 15],
    [56, 15, 54, 15, 61, 15],
    [67, 29, 65, 22, 69, 36],
    [75, 48, 71, 42, 75, 48]
  ];
  addBezier(signalLayer, 0, frontCurve, INK, 0.38, "Front shallow signal path");

  var backCurve = [
    [39, 49, 39, 49, 41, 43],
    [43, 34, 42, 39, 44, 29],
    [42.5, 25, 44, 28, 41, 21],
    [39.5, 15, 39.5, 18, 39.5, 11],
    [41, 6, 39.5, 9, 41, 6]
  ];
  addBezier(signalLayer, 1, backCurve, INK, 0.38, "Back signal separator");

  function addHexNode(side, cxMm, cyMm, radiusMm, dark, limeCenter, name) {
    var polygon = signalLayer.pathItems.add();
    var points = [];
    for (var i = 0; i < 6; i += 1) {
      var angle = Math.PI / 3 * i;
      points.push([
        x(side, cxMm + Math.cos(angle) * radiusMm),
        y(cyMm + Math.sin(angle) * radiusMm)
      ]);
    }
    polygon.setEntirePath(points);
    polygon.closed = true;
    polygon.name = name;
    stylePath(polygon, dark ? INK : PAPER, INK, mm(0.32));

    var inner = signalLayer.pathItems.ellipse(
      y(cyMm + 0.48),
      x(side, cxMm - 0.48),
      mm(0.96),
      mm(0.96)
    );
    stylePath(inner, limeCenter ? LIME : PAPER, null, 0);
  }

  addHexNode(0, 17, 34, 1.85, false, true, "Front lime signal node");
  addHexNode(0, 68, 34, 1.35, true, false, "Front dark signal node");
  addHexNode(1, 42.1, 39, 1.35, true, false, "Back dark signal node");
  addHexNode(1, 39.7, 15, 1.9, false, true, "Back lime signal node");
  log("Signal paths and nodes created");

  function readFile(path) {
    var file = new File(path);
    if (!file.exists) throw new Error("Missing QR SVG: " + path);
    file.encoding = "UTF-8";
    file.open("r");
    var text = file.read();
    file.close();
    return text;
  }

  function addVectorQr() {
    var qrSizeMm = 27;
    var qrLeftMm = (85 - qrSizeMm) / 2;
    var qrBottomMm = 17;
    var qrSizePt = mm(qrSizeMm);
    var source = new File(qrSvgPath);
    if (!source.exists) throw new Error("Missing QR SVG: " + qrSvgPath);
    var group = qrLayer.groupItems.createFromFile(source);
    group.name = "FUNCTIONAL QR - https://scanme.rs - KEEP SQUARE";

    // Scale the imported SVG and its strokes together. Assigning width/height
    // alone leaves the QR's 1-unit SVG strokes unscaled in Illustrator.
    var qrScale = qrSizePt / group.width * 100;
    group.resize(qrScale, qrScale, true, true, true, true, qrScale, Transformation.TOPLEFT);

    // Replace imported RGB colors with the document's print-safe CMYK colors.
    for (var i = 0; i < group.pathItems.length; i += 1) {
      if (group.pathItems[i].filled) group.pathItems[i].fillColor = PAPER;
      if (group.pathItems[i].stroked) group.pathItems[i].strokeColor = QR_BLACK;
    }
    group.left = x(0, qrLeftMm);
    group.top = y(qrBottomMm + qrSizeMm);
    group.note = "Functional vector QR for https://scanme.rs. Keep square and preserve the full quiet zone.";
  }

  addVectorQr();
  log("Functional vector QR placed at 27mm");

  var domain = addCenteredText(textLayer, "scanme.rs", 0, 42.5, 11.0, 8.6, FONT_BOLD, INK, 140);
  domain.name = "Website below QR";
  var slogan = addCenteredText(textLayer, "FIZICKO POSTAJE DIGITALNO.", 0, 42.5, 4.2, 7.1, FONT_REGULAR, INK, 145);
  slogan.name = "Slogan";

  function addLine(layer, side, x1Mm, y1Mm, x2Mm, y2Mm, color, widthMm, name) {
    var line = layer.pathItems.add();
    line.setEntirePath([[x(side, x1Mm), y(y1Mm)], [x(side, x2Mm), y(y2Mm)]]);
    line.closed = false;
    line.filled = false;
    line.stroked = true;
    line.strokeColor = color;
    line.strokeWidth = mm(widthMm);
    line.name = name || "Line";
    return line;
  }

  function addCircle(layer, side, cxMm, cyMm, diameterMm, fillColor, strokeColor, widthMm, name) {
    var item = layer.pathItems.ellipse(
      y(cyMm + diameterMm / 2),
      x(side, cxMm - diameterMm / 2),
      mm(diameterMm),
      mm(diameterMm)
    );
    item.name = name || "Circle";
    return stylePath(item, fillColor, strokeColor, mm(widthMm || 0));
  }

  function addPhoneIcon(side, cxMm, cyMm) {
    addCircle(textLayer, side, cxMm, cyMm, 4.5, null, INK, 0.28, "Phone icon circle");
    var handset = textLayer.pathItems.add();
    handset.setEntirePath([
      [x(side, cxMm - 1.15), y(cyMm + 1.2)],
      [x(side, cxMm - 0.65), y(cyMm + 0.1)],
      [x(side, cxMm + 0.35), y(cyMm - 0.75)],
      [x(side, cxMm + 1.2), y(cyMm - 1.05)]
    ]);
    handset.filled = false;
    handset.stroked = true;
    handset.strokeColor = INK;
    handset.strokeWidth = mm(0.42);
  }

  function addMailIcon(side, cxMm, cyMm) {
    addCircle(textLayer, side, cxMm, cyMm, 4.5, null, INK, 0.28, "Email icon circle");
    var box = textLayer.pathItems.rectangle(y(cyMm + 1.1), x(side, cxMm - 1.45), mm(2.9), mm(2.2));
    stylePath(box, null, INK, mm(0.24));
    addLine(textLayer, side, cxMm - 1.35, cyMm + 0.85, cxMm, cyMm - 0.15, INK, 0.22, "Email fold left");
    addLine(textLayer, side, cxMm, cyMm - 0.15, cxMm + 1.35, cyMm + 0.85, INK, 0.22, "Email fold right");
  }

  function addWebIcon(side, cxMm, cyMm) {
    addCircle(textLayer, side, cxMm, cyMm, 4.5, null, INK, 0.28, "Website icon circle");
    var oval = textLayer.pathItems.ellipse(y(cyMm + 2.05), x(side, cxMm - 0.85), mm(1.7), mm(4.1));
    stylePath(oval, null, INK, mm(0.22));
    addLine(textLayer, side, cxMm - 1.95, cyMm, cxMm + 1.95, cyMm, INK, 0.22, "Website equator");
  }

  addPhoneIcon(1, 8.7, 35.5);
  addMailIcon(1, 8.7, 27.5);
  addWebIcon(1, 8.7, 19.5);

  var phone = addPointText(textLayer, "+381 6X XXX XX XX", 1, 14.0, 34.8, 8.4, FONT_REGULAR, INK, 10);
  phone.name = "Editable phone";
  var email = addPointText(textLayer, "aleksa@scanme.rs", 1, 14.0, 26.8, 8.4, FONT_REGULAR, INK, 10);
  email.name = "Editable email";
  var website = addPointText(textLayer, "scanme.rs", 1, 14.0, 18.8, 8.4, FONT_REGULAR, INK, 10);
  website.name = "Website repeated on back";
  addLine(textLayer, 1, 7.2, 11.6, 32.7, 11.6, MUTED, 0.18, "Contact column rule");

  var firstName = addPointText(textLayer, "Aleksa", 1, 49.0, 32.5, 14.0, FONT_BOLD, INK, -25);
  firstName.name = "Editable first name";
  var lastName = addPointText(textLayer, "Djordjevic", 1, 49.0, 26.2, 14.0, FONT_BOLD, INK, -25);
  lastName.name = "Editable last name";
  var role = addPointText(textLayer, "OSNIVAC", 1, 49.2, 20.7, 7.5, FONT_BOLD, MUTED, 180);
  role.name = "Editable role";
  addLine(textLayer, 1, 49.0, 15.8, 77.1, 15.8, INK, 0.30, "Name column rule");
  addLine(textLayer, 1, 77.1, 15.8, 79.0, 15.8, LIME, 0.30, "Small lime accent");

  function addGuideRect(side, insetMm, color, name) {
    var rect = guidesLayer.pathItems.rectangle(
      y(55 - insetMm),
      x(side, insetMm),
      mm(85 - insetMm * 2),
      mm(55 - insetMm * 2)
    );
    rect.name = name;
    stylePath(rect, null, color, mm(0.18));
    rect.strokeDashes = [mm(1.2), mm(0.8)];
  }

  addGuideRect(0, 0, GUIDE_BLEED, "Front trim edge");
  addGuideRect(1, 0, GUIDE_BLEED, "Back trim edge");
  addGuideRect(0, 4, GUIDE_SAFE, "Front 4mm safe area");
  addGuideRect(1, 4, GUIDE_SAFE, "Back 4mm safe area");
  function addRoundedCornerGuide(side) {
    var guide = guidesLayer.pathItems.roundedRectangle(
      y(55),
      x(side, 0),
      CARD_W,
      CARD_H,
      mm(3),
      mm(3)
    );
    guide.name = side === 0 ? "Front optional R3mm corner cut" : "Back optional R3mm corner cut";
    stylePath(guide, null, GUIDE_BLEED, mm(0.18));
    guide.strokeDashes = [mm(1.2), mm(0.8)];
  }
  addRoundedCornerGuide(0);
  addRoundedCornerGuide(1);
  var qrGuide = guidesLayer.pathItems.rectangle(y(44), x(0, 29), mm(27), mm(27));
  qrGuide.name = "QR protected square incl. quiet zone";
  stylePath(qrGuide, null, GUIDE_SAFE, mm(0.18));
  qrGuide.strokeDashes = [mm(1), mm(0.7)];
  guidesLayer.printable = false;
  guidesLayer.visible = false;
  guidesLayer.locked = true;
  log("Editable text and non-printing guides created");

  var aiOptions = new IllustratorSaveOptions();
  aiOptions.compatibility = Compatibility.ILLUSTRATOR24;
  aiOptions.pdfCompatible = true;
  aiOptions.compressed = true;
  aiOptions.embedICCProfile = true;
  aiOptions.saveMultipleArtboards = false;
  doc.saveAs(new File(aiPath), aiOptions);
  log("Native AI template saved");

  var pngOptions = new ExportOptionsPNG24();
  pngOptions.transparency = false;
  pngOptions.antiAliasing = true;
  pngOptions.artBoardClipping = true;
  pngOptions.horizontalScale = 416.6667;
  pngOptions.verticalScale = 416.6667;

  doc.artboards.setActiveArtboardIndex(0);
  doc.exportFile(new File(frontPngPath), ExportType.PNG24, pngOptions);
  doc.artboards.setActiveArtboardIndex(1);
  doc.exportFile(new File(backPngPath), ExportType.PNG24, pngOptions);
  log("Front and back PNG previews exported");

  var pdfOptions = new PDFSaveOptions();
  pdfOptions.pDFPreset = "[Press Quality]";
  pdfOptions.preserveEditability = false;
  pdfOptions.generateThumbnails = true;
  pdfOptions.trimMarks = true;
  pdfOptions.registrationMarks = false;
  pdfOptions.colorBars = false;
  pdfOptions.pageInformation = true;
  pdfOptions.offset = mm(4);
  pdfOptions.bleedLink = true;
  pdfOptions.bleedOffsetRect = [PDF_BLEED, PDF_BLEED, PDF_BLEED, PDF_BLEED];
  pdfOptions.artboardRange = "1-2";
  doc.saveAs(new File(pdfPath), pdfOptions);
  log("Two-page print PDF saved");

  doc.close(SaveOptions.DONOTSAVECHANGES);
  app.userInteractionLevel = previousInteractionLevel;
  log("Build completed");

  "CREATED|" + aiPath + "|" + pdfPath + "|" + frontPngPath + ".png|" + backPngPath + ".png";
})();
