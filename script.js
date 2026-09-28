const RAMP = " .:-=+*#%@";
const FONT_SIZE = 12;
const FONT = `${FONT_SIZE}px Menlo, Consolas, monospace`;

// The elements on the page we need to read from or draw to
const webcamButton = document.getElementById("webcam");
const video = document.getElementById("video");
const widthSlider = document.getElementById("width");
const widthValue = document.getElementById("widthValue");
const colourToggle = document.getElementById("colour");
const output = document.getElementById("output");

const colourChoice = document.getElementById("colourChoice");

let stream = null; // the live webcam feed, while it's running
let animationId = null; // lets us stop the frame loop

// A hidden canvas, reused on every frame, for shrinking the video
const smallCanvas = document.createElement("canvas");
const smallCtx = smallCanvas.getContext("2d", { willReadFrequently: true });

// Draws the current video frame small on the hidden canvas, flipped
// so it behaves like a mirror, then reads back its pixels.
function resize(width) {
  const height = Math.round(
    ((video.videoHeight / video.videoWidth) * width) / 2,
  );

  // Setting the size also clears the canvas and resets any flip
  smallCanvas.width = width;
  smallCanvas.height = height;

  smallCtx.translate(width, 0);
  smallCtx.scale(-1, 1);

  smallCtx.drawImage(video, 0, 0, width, height);
  return smallCtx.getImageData(0, 0, width, height);
}

// Gets brightness of each pixel, assigns character to represent it — ' ' being the least bright, and '@' being the most bright
function pixelToChar(brightness) {
  const index = Math.floor((brightness / 255) * (RAMP.length - 1));
  return RAMP[index];
}

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

// Converts array of chars into image
function asciiToImage(rows, canvas, useColour, textColour) {
  const ctx = canvas.getContext("2d");

  ctx.font = FONT;
  const metrics = ctx.measureText("@");
  const charWidth = metrics.width;
  const lineHeight = Math.ceil(
    metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
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
        if (char === " ") return; // nothing to draw
        ctx.fillStyle = colour;
        ctx.fillText(char, x * charWidth, y * lineHeight);
      });
    } else {
      // All one colour, so draw the whole row in one go, which is much faster
      ctx.fillStyle = textColour;
      const text = row.map(({ char }) => char).join("");
      ctx.fillText(text, 0, y * lineHeight);
    }
  });
}

function render() {
  if (!stream) return; // webcam is off; the last frame stays on screen
  if (!video.videoWidth) return; // the webcam hasn't sent its first frame yet

  const pixels = resize(Number(widthSlider.value));
  const rows = imageToAscii(pixels);
  asciiToImage(rows, output, colourToggle.checked, colourChoice.value);
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

  webcamButton.textContent = "Stop webcam";
  loop();
}

function stopWebcam() {
  if (!stream) return;
  cancelAnimationFrame(animationId);
  stream.getTracks().forEach((track) => track.stop()); // turns the camera light off
  stream = null;
  video.srcObject = null;
  webcamButton.textContent = "Start webcam";
}

// Re-run whenever the user changes something on the page
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
