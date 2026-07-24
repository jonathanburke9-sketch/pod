(function () {
  const OPENCV_URL = '/vendor/opencv.js';
  let cvReadyPromise = null;

  function loadOpenCv() {
    if (window.cv && typeof window.cv.Mat === 'function') {
      return Promise.resolve(window.cv);
    }

    if (cvReadyPromise) {
      return cvReadyPromise;
    }

    cvReadyPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('OpenCV.js timed out while loading'));
      }, 30000);

      function finish(cvRef) {
        window.clearTimeout(timeout);
        resolve(cvRef);
      }

      function waitForRuntimeReady(maxMs) {
        const started = Date.now();
        const tick = () => {
          if (window.cv && typeof window.cv.Mat === 'function') {
            finish(window.cv);
            return;
          }
          if (Date.now() - started > maxMs) {
            reject(new Error('OpenCV runtime did not initialize in time'));
            return;
          }
          window.setTimeout(tick, 60);
        };
        tick();
      }

      if (window.cv && typeof window.cv === 'object') {
        if (typeof window.cv.Mat === 'function') {
          finish(window.cv);
          return;
        }
        window.cv.onRuntimeInitialized = () => finish(window.cv);
        waitForRuntimeReady(10000);
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = OPENCV_URL;
      script.onload = () => {
        if (!window.cv) {
          reject(new Error('OpenCV script loaded but cv is unavailable'));
          return;
        }
        if (typeof window.cv.Mat === 'function') {
          finish(window.cv);
          return;
        }
        window.cv.onRuntimeInitialized = () => finish(window.cv);
        waitForRuntimeReady(10000);
      };
      script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
      document.head.appendChild(script);
    });

    return cvReadyPromise;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function orderCorners(points) {
    const sums = points.map(p => p.x + p.y);
    const diffs = points.map(p => p.x - p.y);

    const tl = points[sums.indexOf(Math.min(...sums))];
    const br = points[sums.indexOf(Math.max(...sums))];
    const tr = points[diffs.indexOf(Math.min(...diffs))];
    const bl = points[diffs.indexOf(Math.max(...diffs))];

    return [tl, tr, br, bl];
  }

  function contourToPoints(contour, cvRef) {
    const points = [];
    for (let i = 0; i < contour.rows; i += 1) {
      points.push({
        x: contour.intAt(i, 0),
        y: contour.intAt(i, 1)
      });
    }
    return orderCorners(points);
  }

  function defaultQuad(width, height) {
    const padX = Math.round(width * 0.08);
    const padY = Math.round(height * 0.08);
    return [
      { x: padX, y: padY },
      { x: width - padX, y: padY },
      { x: width - padX, y: height - padY },
      { x: padX, y: height - padY }
    ];
  }

  class DocScannerEngine {
    constructor(options) {
      this.video = options.video;
      this.overlayCanvas = options.overlayCanvas;
      this.onAutoCapture = options.onAutoCapture || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.minFocusScore = options.minFocusScore || 120;
      this.minAreaRatio = options.minAreaRatio || 0.2;
      this.requiredStableFrames = options.requiredStableFrames || 10;
      this.autoCaptureCooldownMs = options.autoCaptureCooldownMs || 1800;

      this.cv = null;
      this.previewCanvas = document.createElement('canvas');
      this.previewCtx = this.previewCanvas.getContext('2d', { willReadFrequently: true });
      this.running = false;
      this.frameRequestId = 0;
      this.lastDetectedQuad = null;
      this.lastPreviewSize = { width: 0, height: 0 };
      this.prevCenter = null;
      this.prevArea = 0;
      this.stableFrames = 0;
      this.lastAutoCaptureAt = 0;
      this.lastFocusScore = 0;
    }

    async init() {
      this.cv = await loadOpenCv();
      return this;
    }

    setOverlayVisible(visible) {
      if (!this.overlayCanvas) return;
      this.overlayCanvas.classList.toggle('hidden', !visible);
    }

    syncOverlaySize(width, height) {
      if (!this.overlayCanvas) return;
      this.overlayCanvas.width = width;
      this.overlayCanvas.height = height;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.setOverlayVisible(true);
      this.loop();
    }

    stop() {
      this.running = false;
      if (this.frameRequestId) {
        cancelAnimationFrame(this.frameRequestId);
        this.frameRequestId = 0;
      }
      this.clearOverlay();
      this.setOverlayVisible(false);
      this.lastDetectedQuad = null;
      this.stableFrames = 0;
      this.prevCenter = null;
      this.prevArea = 0;
    }

    clearOverlay() {
      if (!this.overlayCanvas) return;
      const ctx = this.overlayCanvas.getContext('2d');
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    computeFocusScore(grayMat) {
      const lap = new this.cv.Mat();
      const mean = new this.cv.Mat();
      const stddev = new this.cv.Mat();

      this.cv.Laplacian(grayMat, lap, this.cv.CV_64F);
      this.cv.meanStdDev(lap, mean, stddev);
      const sigma = stddev.doubleAt(0, 0);
      const variance = sigma * sigma;

      lap.delete();
      mean.delete();
      stddev.delete();
      return variance;
    }

    detectDocument(srcMat) {
      const gray = new this.cv.Mat();
      const blur = new this.cv.Mat();
      const edges = new this.cv.Mat();
      const contours = new this.cv.MatVector();
      const hierarchy = new this.cv.Mat();

      this.cv.cvtColor(srcMat, gray, this.cv.COLOR_RGBA2GRAY);
      this.cv.GaussianBlur(gray, blur, new this.cv.Size(5, 5), 0);
      this.cv.Canny(blur, edges, 50, 150);

      const kernel = this.cv.getStructuringElement(this.cv.MORPH_RECT, new this.cv.Size(5, 5));
      this.cv.morphologyEx(edges, edges, this.cv.MORPH_CLOSE, kernel);
      kernel.delete();

      this.cv.findContours(edges, contours, hierarchy, this.cv.RETR_LIST, this.cv.CHAIN_APPROX_SIMPLE);

      let bestQuad = null;
      let bestArea = 0;
      const minArea = srcMat.rows * srcMat.cols * this.minAreaRatio;

      for (let i = 0; i < contours.size(); i += 1) {
        const cnt = contours.get(i);
        const perimeter = this.cv.arcLength(cnt, true);
        const approx = new this.cv.Mat();
        this.cv.approxPolyDP(cnt, approx, 0.02 * perimeter, true);

        if (approx.rows === 4) {
          const area = Math.abs(this.cv.contourArea(approx));
          if (area > bestArea && area > minArea) {
            bestArea = area;
            if (bestQuad) {
              bestQuad.delete();
            }
            bestQuad = approx.clone();
          }
        }

        approx.delete();
        cnt.delete();
      }

      const focusScore = this.computeFocusScore(gray);

      gray.delete();
      blur.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();

      return {
        quad: bestQuad,
        area: bestArea,
        focusScore
      };
    }

    drawOverlay(quad, previewWidth, previewHeight) {
      if (!this.overlayCanvas) return;

      this.syncOverlaySize(previewWidth, previewHeight);
      const ctx = this.overlayCanvas.getContext('2d');
      ctx.clearRect(0, 0, previewWidth, previewHeight);

      if (!quad) return;

      const points = contourToPoints(quad, this.cv);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.lineTo(points[3].x, points[3].y);
      ctx.closePath();
      ctx.stroke();

      points.forEach(point => {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    updateStability(quad, focusScore) {
      if (!quad) {
        this.stableFrames = 0;
        this.prevCenter = null;
        this.prevArea = 0;
        return false;
      }

      const points = contourToPoints(quad, this.cv);
      const center = {
        x: (points[0].x + points[2].x) / 2,
        y: (points[0].y + points[2].y) / 2
      };
      const area = Math.abs((points[0].x * points[1].y - points[1].x * points[0].y)
        + (points[1].x * points[2].y - points[2].x * points[1].y)
        + (points[2].x * points[3].y - points[3].x * points[2].y)
        + (points[3].x * points[0].y - points[0].x * points[3].y)) / 2;

      if (!this.prevCenter) {
        this.prevCenter = center;
        this.prevArea = area;
        this.stableFrames = 1;
        return false;
      }

      const centerDrift = distance(center, this.prevCenter);
      const areaDrift = Math.abs(area - this.prevArea) / Math.max(this.prevArea, 1);

      if (centerDrift < 8 && areaDrift < 0.05 && focusScore >= this.minFocusScore) {
        this.stableFrames += 1;
      } else {
        this.stableFrames = 0;
      }

      this.prevCenter = center;
      this.prevArea = area;
      return this.stableFrames >= this.requiredStableFrames;
    }

    loop() {
      if (!this.running) return;

      if (!this.video || this.video.readyState < 2) {
        this.frameRequestId = requestAnimationFrame(() => this.loop());
        return;
      }

      const sourceWidth = this.video.videoWidth;
      const sourceHeight = this.video.videoHeight;
      const maxWidth = 960;
      const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
      const previewWidth = Math.max(1, Math.round(sourceWidth * scale));
      const previewHeight = Math.max(1, Math.round(sourceHeight * scale));

      if (this.previewCanvas.width !== previewWidth || this.previewCanvas.height !== previewHeight) {
        this.previewCanvas.width = previewWidth;
        this.previewCanvas.height = previewHeight;
      }

      this.previewCtx.drawImage(this.video, 0, 0, previewWidth, previewHeight);
      const frameMat = this.cv.imread(this.previewCanvas);

      const detection = this.detectDocument(frameMat);
      this.lastFocusScore = detection.focusScore;
      if (this.lastDetectedQuad) {
        this.lastDetectedQuad.delete();
      }
      this.lastDetectedQuad = detection.quad ? detection.quad.clone() : null;
      this.lastPreviewSize = { width: previewWidth, height: previewHeight };

      this.drawOverlay(detection.quad, previewWidth, previewHeight);

      const stableAndSharp = this.updateStability(detection.quad, detection.focusScore);
      const now = Date.now();

      if (stableAndSharp && now - this.lastAutoCaptureAt > this.autoCaptureCooldownMs) {
        this.lastAutoCaptureAt = now;
        this.onStatus('Document is stable and sharp. Capturing...');
        this.onAutoCapture();
      } else if (detection.focusScore < this.minFocusScore) {
        this.onStatus('Move less and refocus. Document appears blurry.');
      }

      if (detection.quad) {
        detection.quad.delete();
      }
      frameMat.delete();

      this.frameRequestId = requestAnimationFrame(() => this.loop());
    }

    buildWarpedDocument(srcMat) {
      if (!this.lastDetectedQuad) {
        return srcMat.clone();
      }

      const scaleX = srcMat.cols / Math.max(this.lastPreviewSize.width, 1);
      const scaleY = srcMat.rows / Math.max(this.lastPreviewSize.height, 1);
      const points = contourToPoints(this.lastDetectedQuad, this.cv).map(point => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      }));

      const [tl, tr, br, bl] = points;
      const widthA = distance(br, bl);
      const widthB = distance(tr, tl);
      const maxWidth = Math.max(Math.round(widthA), Math.round(widthB), 1);

      const heightA = distance(tr, br);
      const heightB = distance(tl, bl);
      const maxHeight = Math.max(Math.round(heightA), Math.round(heightB), 1);

      const srcTri = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y
      ]);
      const dstTri = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        0, 0,
        maxWidth - 1, 0,
        maxWidth - 1, maxHeight - 1,
        0, maxHeight - 1
      ]);

      const transform = this.cv.getPerspectiveTransform(srcTri, dstTri);
      const warped = new this.cv.Mat();
      this.cv.warpPerspective(srcMat, warped, transform, new this.cv.Size(maxWidth, maxHeight));

      srcTri.delete();
      dstTri.delete();
      transform.delete();

      return warped;
    }

    buildWarpedDocumentFromPoints(srcMat, pointsInput) {
      const points = orderCorners((pointsInput || []).map(point => ({
        x: Number(point.x || 0),
        y: Number(point.y || 0)
      })));
      const [tl, tr, br, bl] = points;

      const widthA = distance(br, bl);
      const widthB = distance(tr, tl);
      const maxWidth = Math.max(Math.round(widthA), Math.round(widthB), 1);

      const heightA = distance(tr, br);
      const heightB = distance(tl, bl);
      const maxHeight = Math.max(Math.round(heightA), Math.round(heightB), 1);

      const srcTri = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y
      ]);
      const dstTri = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        0, 0,
        maxWidth - 1, 0,
        maxWidth - 1, maxHeight - 1,
        0, maxHeight - 1
      ]);

      const transform = this.cv.getPerspectiveTransform(srcTri, dstTri);
      const warped = new this.cv.Mat();
      this.cv.warpPerspective(srcMat, warped, transform, new this.cv.Size(maxWidth, maxHeight));

      srcTri.delete();
      dstTri.delete();
      transform.delete();

      return warped;
    }

    processForScan(mat) {
      const gray = new this.cv.Mat();
      const bw = new this.cv.Mat();
      const blur = new this.cv.Mat();
      const sharpen = new this.cv.Mat();
      const rgbaOut = new this.cv.Mat();

      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY);
      const focusScore = this.computeFocusScore(gray);

      this.cv.adaptiveThreshold(
        gray,
        bw,
        255,
        this.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        this.cv.THRESH_BINARY,
        31,
        15
      );

      this.cv.GaussianBlur(bw, blur, new this.cv.Size(0, 0), 1.0);
      this.cv.addWeighted(bw, 1.35, blur, -0.35, 0, sharpen);
      this.cv.cvtColor(sharpen, rgbaOut, this.cv.COLOR_GRAY2RGBA);

      gray.delete();
      bw.delete();
      blur.delete();
      sharpen.delete();

      return { processedMat: rgbaOut, focusScore };
    }

    async captureProcessed() {
      if (!this.video || this.video.readyState < 2) {
        return { ok: false, reason: 'Camera is not ready' };
      }

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = this.video.videoWidth;
      sourceCanvas.height = this.video.videoHeight;
      const sourceCtx = sourceCanvas.getContext('2d');
      sourceCtx.drawImage(this.video, 0, 0, sourceCanvas.width, sourceCanvas.height);

      const srcMat = this.cv.imread(sourceCanvas);
      const warped = this.buildWarpedDocument(srcMat);
      const { processedMat, focusScore } = this.processForScan(warped);

      if (focusScore < this.minFocusScore) {
        srcMat.delete();
        warped.delete();
        processedMat.delete();
        return {
          ok: false,
          reason: 'Capture rejected because it is blurry. Hold steady and retry.',
          focusScore
        };
      }

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = processedMat.cols;
      outputCanvas.height = processedMat.rows;
      this.cv.imshow(outputCanvas, processedMat);
      const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);

      srcMat.delete();
      warped.delete();
      processedMat.delete();

      return {
        ok: true,
        dataUrl,
        focusScore,
        edgeDetected: Boolean(this.lastDetectedQuad)
      };
    }

    async captureProcessedFromCanvas(sourceCanvas) {
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
        return { ok: false, reason: 'Native camera image is empty' };
      }

      const srcMat = this.cv.imread(sourceCanvas);
      const detection = this.detectDocument(srcMat);

      if (this.lastDetectedQuad) {
        this.lastDetectedQuad.delete();
      }
      this.lastDetectedQuad = detection.quad ? detection.quad.clone() : null;
      this.lastPreviewSize = { width: srcMat.cols, height: srcMat.rows };

      const warped = this.buildWarpedDocument(srcMat);
      const { processedMat, focusScore } = this.processForScan(warped);

      if (focusScore < this.minFocusScore) {
        if (detection.quad) detection.quad.delete();
        srcMat.delete();
        warped.delete();
        processedMat.delete();
        return {
          ok: false,
          reason: 'Capture rejected because it is blurry. Hold steady and retry.',
          focusScore,
          edgeDetected: Boolean(this.lastDetectedQuad)
        };
      }

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = processedMat.cols;
      outputCanvas.height = processedMat.rows;
      this.cv.imshow(outputCanvas, processedMat);
      const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);

      if (detection.quad) detection.quad.delete();
      srcMat.delete();
      warped.delete();
      processedMat.delete();

      return {
        ok: true,
        dataUrl,
        focusScore,
        edgeDetected: Boolean(this.lastDetectedQuad)
      };
    }

    async detectQuadFromCanvas(sourceCanvas) {
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
        return { ok: false, reason: 'Native camera image is empty' };
      }

      const srcMat = this.cv.imread(sourceCanvas);
      const detection = this.detectDocument(srcMat);
      const quad = detection.quad
        ? contourToPoints(detection.quad, this.cv).map(point => ({ x: point.x, y: point.y }))
        : defaultQuad(srcMat.cols, srcMat.rows);

      if (detection.quad) {
        detection.quad.delete();
      }
      srcMat.delete();

      return {
        ok: true,
        quad,
        edgeDetected: Boolean(detection.quad),
        focusScore: detection.focusScore
      };
    }

    async processCanvasWithQuad(sourceCanvas, quadPoints) {
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
        return { ok: false, reason: 'Native camera image is empty' };
      }

      const srcMat = this.cv.imread(sourceCanvas);
      const warped = this.buildWarpedDocumentFromPoints(srcMat, quadPoints);
      const { processedMat, focusScore } = this.processForScan(warped);

      if (focusScore < this.minFocusScore) {
        srcMat.delete();
        warped.delete();
        processedMat.delete();
        return {
          ok: false,
          reason: 'Capture rejected because it is blurry. Hold steady and retry.',
          focusScore
        };
      }

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = processedMat.cols;
      outputCanvas.height = processedMat.rows;
      this.cv.imshow(outputCanvas, processedMat);
      const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);

      srcMat.delete();
      warped.delete();
      processedMat.delete();

      return {
        ok: true,
        dataUrl,
        focusScore,
        edgeDetected: true
      };
    }
  }

  window.DocScanner = {
    async create(options) {
      const engine = new DocScannerEngine(options || {});
      await engine.init();
      return engine;
    }
  };
})();