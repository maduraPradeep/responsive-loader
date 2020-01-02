"use strict";
const sharp = require('sharp');

module.exports = (imagePath) => {
  const image = sharp(imagePath);
  return {
    metadata: () => image.metadata(),
    resize: ({ width, mime, options }) => new Promise((resolve, reject) => {
      console.debug("width:", width, mime, options)
      let resized = image.clone()
        .resize(width, null);
      if (options.background) {
        resized = resized.background(options.background)
          .flatten();
      }
      if (mime === 'image/jpeg') {
        resized = resized.jpeg({
          quality: options.quality
        });
      }
      if (mime === "image/webp") {
        resized = resized.webp();
      }
      resized.toBuffer((err, data, { height }) => {
        if (err) {
          reject(err);
        }
        else {
          resolve({
            data,
            width,
            height, mime
          });
        }
      });
    })
  };
};
