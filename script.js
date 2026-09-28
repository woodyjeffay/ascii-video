const RAMP = " .:-=+*#%@";
const FONT_SIZE = 12;
const FONT = `${FONT_SIZE}px Menlo, Consolas, monospace`;

// The elements on the page we need to read from or draw to
const upload = document.getElementById("upload");
const webcamButton = document.getElementById("webcam");
const video = document.getElementById("video");
const widthSlider = document.getElementById("width");
const widthValue = document.getElementById("widthValue");
const colourToggle = document.getElementById("colour");
const downloadButton = document.getElementById("download");
const output = document.getElementById("output");

let currentSource = null;  // either an uploaded image or the webcam video
let mirror = false;        // flip the webcam so it behaves like a mirror
let stream = null;         // the live webcam feed, while it's running
let animationId = null;    // lets us stop the frame loop

// A hidden canvas, reused on every frame, for shrinking the source
const smallCanvas = document.createElement("canvas");
const smallCtx = smallCanvas.getContext("2d", { willReadFrequently: true });


// Python: load_image
// Loading an image takes time, so this returns a Promise that
// resolves once the image is ready.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}


// Images and videos report their size under different names
function sourceSize(source) {
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth, source.videoHeight];
  }
  return [source.naturalWidth, source.naturalHeight];
}


// Python: resize
// Draws the source small on the hidden canvas, then reads back its pixels.
function resize(source, width, mirror) {
  const [sourceWidth, sourceHeight] = sourceSize(source);
  const height = Math.round(sourceHeight / sourceWidth * width / 2);

  // Setting the size also clears the canvas and resets any flip
  smallCanvas.width = width;
  smallCanvas.height = height;

  if (mirror) {
    smallCtx.translate(width, 0);
    smallCtx.scale(-1, 1);
  }

  smallCtx.drawImage(source, 0, 0, width, height);
  return smallCtx.getImageData(0, 0, width, height);
}


// Python: pixel_to_char
function pixelToChar(brightness) {
  const index = Math.floor(brightness / 255 * (RAMP.length - 1));
  return RAMP[index];
}


// Python: image_to_ascii
// The pixel data is one long flat list: red, green, blue, alpha,
// red, green, blue, alpha... so each pixel takes up four slots.
function imageToAscii(pixels) {
  const { width, height, data } = pixels;
  const rows = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // The same weighting Pillow uses when converting to greyscale
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      row.push({
        char: pixelToChar(brightness),
        colour: `rgb(${r}, ${g}, ${b})`,
      });
    }
    rows.push(row);
  }

  return rows;
}


// Python: ascii_to_image
function asciiToImage(rows, canvas, useColour) {
  const ctx = canvas.getContext("2d");

  ctx.font = FONT;
  const metrics = ctx.measureText("@");
  const charWidth = metrics.width;
  const lineHeight = Math.ceil(
    metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent
  );

  // Resizing a canvas wipes it and is slow, so on a live feed
  // only do it when the size has actually changed.
  const newWidth = Math.ceil(charWidth * rows[0].length);
  const newHeight = lineHeight * rows.length;
  if (canvas.width !== newWidth || canvas.height !== newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
  }

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = FONT;
  ctx.textBaseline = "top";

  rows.forEach((row, y) => {
    if (useColour) {
      // Each character needs its own colour, so draw them one by one
      row.forEach(({ char, colour }, x) => {
        if (char === " ") return;  // nothing to draw
        ctx.fillStyle = colour;
        ctx.fillText(char, x * charWidth, y * lineHeight);
      });
    } else {
      // All one colour, so draw the whole row in one go, which is much faster
      ctx.fillStyle = "white";
      const text = row.map(({ char }) => char).join("");
      ctx.fillText(text, 0, y * lineHeight);
    }
  });
}


// Python: the main block
function render() {
  if (!currentSource) return;
  const [sourceWidth] = sourceSize(currentSource);
  if (!sourceWidth) return;  // the webcam hasn't sent its first frame yet

  const pixels = resize(currentSource, Number(widthSlider.value), mirror);
  const rows = imageToAscii(pixels);
  asciiToImage(rows, output, colourToggle.checked);
  downloadButton.disabled = false;
}


// Runs render() once per screen refresh, around 60 times a second,
// for as long as the webcam is on.
function loop() {
  render();
  animationId = requestAnimationFrame(loop);
}


async function startWebcam() {
  // Browsers only allow the camera on https pages or localhost
  if (!navigator.mediaDevices) {
    alert("The webcam needs the page served over https or from localhost.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (err) {
    alert(`Couldn't start the webcam: ${err.message}`);
    return;
  }

  video.srcObject = stream;
  await video.play();

  currentSource = video;
  mirror = true;
  webcamButton.textContent = "Stop webcam";
  loop();
}


function stopWebcam() {
  if (!stream) return;
  cancelAnimationFrame(animationId);
  stream.getTracks().forEach((track) => track.stop());  // turns the camera light off
  stream = null;
  video.srcObject = null;
  currentSource = null;  // the last frame stays on screen
  webcamButton.textContent = "Start webcam";
}


// Re-run whenever the user changes something on the page
upload.addEventListener("change", async () => {
  const file = upload.files[0];
  if (!file) return;
  stopWebcam();
  currentSource = await loadImage(file);
  mirror = false;
  render();
});

webcamButton.addEventListener("click", () => {
  if (stream) {
    stopWebcam();
  } else {
    startWebcam();
  }
});

widthSlider.addEventListener("input", () => {
  widthValue.textContent = widthSlider.value;
  render();
});

colourToggle.addEventListener("change", render);

downloadButton.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "ascii.png";
  link.href = output.toDataURL("image/png");
  link.click();
});
