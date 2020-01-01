'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var path = require('path');
var loaderUtils = require('loader-utils');

var MIMES = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp'
};

var EXTS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

module.exports = function loader(content) {
  var loaderCallback = this.async();
  var parsedResourceQuery = this.resourceQuery ? loaderUtils.parseQuery(this.resourceQuery) : {};
  var config = Object.assign({}, loaderUtils.getOptions(this), parsedResourceQuery);
  var outputContext = config.context || this.rootContext || this.options && this.options.context;
  var outputPlaceholder = Boolean(config.placeholder) || false;
  var placeholderSize = parseInt(config.placeholderSize, 10) || 40;
  // JPEG compression
  var quality = parseInt(config.quality, 10) || 85;
  // Useful when converting from PNG to JPG
  var background = config.background;
  // Specify mimetype to convert to another format
  var originalExtension = path.extname(this.resourcePath).replace(/\./, '');
  var formats = void 0;
  if (config.format) {
    formats = [config.format];
  } else if (config.formats) {
    formats = config.formats;
  } else {
    formats = originalExtension;
  }

  // throw a more friendly error than jimp failing to encode
  if (!config.adapter && formats.find(function (f) {
    return f === 'webp';
  })) {
    return loaderCallback(new Error('JIMP does not support webp encoding, use sharp adapter.'));
  }

  var mimes = formats.map(function (f) {
    return MIMES[f];
  });
  var errFormats = mimes.reduce(function (m, i) {
    return !m ? [].concat(_toConsumableArray(acc), [formats[i]]) : acc;
  }, []);
  if (errFormats.length > 0) {
    return loaderCallback(new Error('Formats not supported: ', JSON.stringify(errFormats)));
  }

  var name = config.name || '[hash]-[width].[ext]';

  var adapter = config.adapter || require('./adapters/jimp');
  var loaderContext = this;

  // The config that is passed to the adatpers
  var adapterOptions = Object.assign({}, config, {
    quality,
    background
  });

  var min = config.min !== undefined ? parseInt(config.min, 10) : undefined;
  var max = config.max !== undefined ? parseInt(config.max, 10) : undefined;
  var steps = config.steps === undefined ? 4 : parseInt(config.steps, 10);

  var generatedSizes = void 0;
  if (typeof min === 'number' && max) {
    generatedSizes = [];

    for (var step = 0; step < steps; step++) {
      var _size = min + (max - min) / (steps - 1) * step;
      generatedSizes.push(Math.ceil(_size));
    }
  }

  var sizes = parsedResourceQuery.size || parsedResourceQuery.sizes || generatedSizes || config.size || config.sizes || [Number.MAX_SAFE_INTEGER];

  if (!sizes) {
    return loaderCallback(null, content);
  }

  if (config.disable) {
    // emit original content only
    var f = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: content
    }).replace(/\[width\]/ig, '100').replace(/\[height\]/ig, '100').replace(/\[ext\]/ig, originalExtension);
    loaderContext.emitFile(f, content);
    var p = '__webpack_public_path__ + ' + JSON.stringify(f);
    return loaderCallback(null, 'module.exports = {srcSet:' + p + ',images:[{path:' + p + ',width:100,height:100}],src: ' + p + ',toString:function(){return ' + p + '}};');
  }

  var createFile = function createFile(mime, _ref) {
    var data = _ref.data,
        width = _ref.width,
        height = _ref.height;

    var ext = EXTS[mime];

    var fileName = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: data
    }).replace(/\[width\]/ig, width).replace(/\[height\]/ig, height).replace(/\[ext\]/ig, ext);

    loaderContext.emitFile(fileName, data);

    return {
      src: '__webpack_public_path__ + ' + JSON.stringify(fileName + ' ' + width + 'w'),
      path: '__webpack_public_path__ + ' + JSON.stringify(fileName),
      width: width,
      height: height
    };
  };

  var createPlaceholder = function createPlaceholder(mime, _ref2) {
    var data = _ref2.data;

    var placeholder = data.toString('base64');
    return JSON.stringify('data:' + (mime ? mime + ';' : '') + 'base64,' + placeholder);
  };

  var img = adapter(loaderContext.resourcePath);
  return img.metadata().then(function (metadata) {
    var promises = mimes.map(function () {
      return [];
    });
    var widthsToGenerate = new Set();

    (Array.isArray(sizes) ? sizes : [sizes]).forEach(function (size) {
      var width = Math.min(metadata.width, parseInt(size, 10));

      // Only resize images if they aren't an exact copy of one already being resized...
      if (!widthsToGenerate.has(width)) {
        widthsToGenerate.add(width);

        mimes.forEach(function (mime, i) {
          promises[i] = img.resize({
            width,
            mime,
            options: adapterOptions
          });
        });
      }
    });

    return Promise.all(promises.map(function (arr) {
      return Promise.all(arr);
    })).then(function (imagesArr) {
      return imagesArr.map(function (images, i) {
        return {
          files: images.map(function (img) {
            return createFile(mime, img);
          }),
          mime: mimes[i]
        };
      });
    }).then(function (filesByMime) {
      if (outputPlaceholder) {
        return img.resize({
          placeholderSize,
          mime: mimes[0],
          options: adapterOptions
        }).then(function (img) {
          return {
            filesByMime,
            placeholder: createPlaceholder(mimes[0], img)
          };
        });
      }

      return { filesByMime };
    });
  }).then(function (_ref3) {
    var filesByMime = _ref3.filesByMime,
        placeholder = _ref3.placeholder;

    var srcSets = filesByMime.map(function (_ref4) {
      var mime = _ref4.mime,
          files = _ref4.files;
      return {
        mime,
        srcSet: files.map(function (f) {
          return f.src;
        }).join(' ')
      };
    });

    var images = filesByMime.reduce(function (acc, _ref5) {
      var mime = _ref5.mime,
          files = _ref5.files;
      return acc.concat(files.map(function (_ref6) {
        var mime = _ref6.mime,
            path = _ref6.path,
            width = _ref6.width,
            height = _ref6.height;
        return { path, width, height };
      }));
    }, []);

    var firstImage = images[0];

    loaderCallback(null, `
        const srcSets = ${JSON.stringify(srcSets)};

        module.exports = {
          srcSets,
          srcSet: srcSets[0].srcSet,
          images: ${JSON.stringify(images)};
          src: ${firstImage.path},
          toString:function(){return ${firstImage.path} },
          placeholder: ${placeholder},
          width: ${firstImage.width},
          height: ${firstImage.height}
        };
      `);
  }).catch(function (err) {
    return loaderCallback(err);
  });
};

module.exports.raw = true; // get buffer stream instead of utf8 string