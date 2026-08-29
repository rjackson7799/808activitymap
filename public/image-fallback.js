(() => {
  "use strict";

  const hideFailedImage = (image) => {
    if (image instanceof HTMLImageElement && image.dataset.publicImage !== undefined) {
      image.hidden = true;
    }
  };

  window.addEventListener("error", (event) => hideFailedImage(event.target), true);
  document.querySelectorAll("img[data-public-image]").forEach((image) => {
    if (image.complete && image.naturalWidth === 0) hideFailedImage(image);
  });
})();
