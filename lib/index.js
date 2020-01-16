'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var path = require('path');
var loaderUtils = require('loader-utils');
var fs = require('fs');
var MIMES = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'svg': 'image/svg+xml'
};

var EXTS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

var getOutputAndPublicPath = function getOutputAndPublicPath(fileName, _ref) {
  var configOutputPath = _ref.outputPath,
      configPublicPath = _ref.publicPath;

  var outputPath = fileName;

  if (configOutputPath) {
    if (typeof configOutputPath === 'function') {
      outputPath = configOutputPath(fileName);
    } else {
      outputPath = path.posix.join(configOutputPath, fileName);
    }
  }

  var publicPath = `__webpack_public_path__ + ${JSON.stringify(outputPath)}`;

  if (configPublicPath) {
    if (typeof configPublicPath === 'function') {
      publicPath = configPublicPath(fileName);
    } else if (configPublicPath.endsWith('/')) {
      publicPath = configPublicPath + fileName;
    } else {
      publicPath = `${configPublicPath}/${fileName}`;
    }

    publicPath = JSON.stringify(publicPath);
  }

  return {
    outputPath,
    publicPath
  };
};

module.exports = function loader(content) {
  var loaderCallback = this.async();
  var parsedResourceQuery = this.resourceQuery ? loaderUtils.parseQuery(this.resourceQuery) : {};
  var config = Object.assign({}, loaderUtils.getOptions(this), parsedResourceQuery);
  var outputContext = config.context || this.rootContext || this.options && this.options.context;
  var outputPlaceholder = Boolean(config.placeholder) || false;
  var placeholderSize = parseInt(config.placeholderSize, 10) || 40;
  var transformedFormats = config.transformedFormats || [];
  // JPEG compression
  var quality = parseInt(config.quality, 10) || 85;
  // Useful when converting from PNG to JPG
  var background = config.background;
  // Specify mimetype to convert to another format
  var mime = void 0;
  var ext = void 0;
  if (config.format) {
    if (!MIMES.hasOwnProperty(config.format)) {
      return loaderCallback(new Error('Format "' + config.format + '" not supported'));
    }
    mime = MIMES[config.format];
    ext = EXTS[mime];
  } else {
    ext = path.extname(this.resourcePath).replace(/\./, '');
    mime = MIMES[ext];
    if (!mime) {
      return loaderCallback(new Error('No mime type for file with extension ' + ext + 'supported'));
    }
  }

  var name = (config.name || '[hash]-[width].[ext]').replace(/\[ext\]/ig, ext);
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

  var originalFileName = loaderUtils.interpolateName(loaderContext, name, {
    context: outputContext,
    content: content
  }).replace(/-\[width\]/ig, '');

  var _getOutputAndPublicPa = getOutputAndPublicPath(originalFileName, config),
      originalFilePublicPath = _getOutputAndPublicPa.publicPath;

  if (config.disable) {
    // emit original content only
    var fileName = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: content
    }).replace(/\[width\]/ig, '100').replace(/\[height\]/ig, '100');

    var _getOutputAndPublicPa2 = getOutputAndPublicPath(fileName, config),
        _outputPath = _getOutputAndPublicPa2.outputPath,
        _publicPath = _getOutputAndPublicPa2.publicPath;

    loaderContext.emitFile(_outputPath, content);

    return loaderCallback(null, 'module.exports = {srcSet:' + _publicPath + ',images:[{path:' + _publicPath + ',width:100,height:100}],src: ' + _publicPath + ',toString:function(){return ' + _publicPath + '}};');
  }

  var createFile = function createFile(_ref2) {
    var data = _ref2.data,
        width = _ref2.width,
        height = _ref2.height,
        mime = _ref2.mime;

    var fileName = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: data
    });

    var type = null;

    if (mime === MIMES.svg) {

      fileName = fileName.replace(/-\[width\]/ig, '').replace(/\[height\]/ig, '');
    } else {
      fileName = fileName.replace(/\[width\]/ig, width).replace(/\[height\]/ig, height);

      if (mime === MIMES.webp) {
        fileName += ".webp";
        type = MIMES.webp;
      }
    }

    var _getOutputAndPublicPa3 = getOutputAndPublicPath(fileName, config),
        outputPath = _getOutputAndPublicPa3.outputPath,
        publicPath = _getOutputAndPublicPa3.publicPath;

    loaderContext.emitFile(outputPath, data);

    if (mime === MIMES.svg) {
      var src = publicPath;

      return {
        src,
        path: publicPath
      };
    } else {
      var _src = publicPath + `+${JSON.stringify(` ${width}w`)}`;

      return {
        src: _src,
        type,
        path: publicPath,
        width: width,
        height: height
      };
    }
  };

  var createPlaceholder = function createPlaceholder(_ref3) {
    var data = _ref3.data;

    var placeholder = data.toString('base64');
    return JSON.stringify('data:' + (mime ? mime + ';' : '') + 'base64,' + placeholder);
  };

  var img = adapter(loaderContext.resourcePath);
  return img.metadata().then(function (metadata) {

    var promises = [];
    var widthsToGenerate = new Set();

    (Array.isArray(sizes) ? sizes : [sizes]).forEach(function (size) {
      var width = Math.min(metadata.width, parseInt(size, 10));

      // Only resize images if they aren't an exact copy of one already being resized...
      if (!widthsToGenerate.has(width)) {
        widthsToGenerate.add(width);

        if (mime !== MIMES.svg) {
          //svg does not required to resize
          promises.push(img.resize({
            width,
            mime,
            options: adapterOptions
          }));
        }

        if (transformedFormats.length > 0) {
          transformedFormats.forEach(function (format) {
            if (MIMES[format]) {
              promises.push(img.resize({
                width,
                mime: MIMES[format],
                options: adapterOptions
              }));
            }
          });
        }
      }
    });

    if (outputPlaceholder && mime !== MIMES.svg) {

      promises.push(img.resize({
        width: placeholderSize,
        options: adapterOptions,
        mime
      }));
    }

    return Promise.all(promises).then(function (results) {
      return outputPlaceholder && mime !== MIMES.svg ? {
        files: results.slice(0, -1).map(createFile),
        placeholder: createPlaceholder(results[results.length - 1])
      } : {
        files: results.map(createFile)
      };
    });
  }).then(function (_ref4) {
    var files = _ref4.files,
        placeholder = _ref4.placeholder;

    var srcSetGroups = files.reduce(function (result, f) {
      if (f.type) {
        (result[f.type] || (result[f.type] = [])).push(f);
      } else {
        result.default.push(f);
      }
      return result;
    }, { default: [] });

    //let images = '';
    var srcSetsToString = '';
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = Object.entries(srcSetGroups)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var _ref5 = _step.value;

        var _ref6 = _slicedToArray(_ref5, 2);

        var key = _ref6[0];
        var value = _ref6[1];


        var srcset = value.map(function (f) {
          return f.src;
        }).join('+","+');

        if (key !== "default") {
          srcSetsToString = '{srcset:' + srcset + ',type:"' + key + '"},' + srcSetsToString; //add to beginning
        } else if (srcset.length > 0) {
          srcSetsToString += '{srcset:' + srcset + '}';
        }

        // images += value.map(f => '{path:' + f.path + ',width:' + f.width + ',height:' + f.height + '}').join(',')
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    var firstImage = files[0];

    srcSetsToString = '[' + srcSetsToString + ']';

    if (mime === MIMES.svg) {

      fs.copyFile(loaderContext.resourcePath, `dist/${originalFileName}`, function (err) {
        if (err) throw err;
        console.log('source.txt was copied to destination.txt');
      });

      loaderCallback(null, 'module.exports = {' + 'srcSets:' + srcSetsToString + ',' +
      //   'images:[' + images + '],' +
      'src:' + originalFilePublicPath + ',' + 'toString:function(){return ' + originalFilePublicPath + '},' + '};');
    } else {
      loaderCallback(null, 'module.exports = {' + 'srcSets:' + srcSetsToString + ',' +
      //   'images:[' + images + '],' +
      'src:' + firstImage.path + ',' + 'toString:function(){return ' + firstImage.path + '},' + 'placeholder: ' + placeholder + ',' + 'width:' + firstImage.width + ',' + 'height:' + firstImage.height + '};');
    }
  }).catch(function (err) {
    return loaderCallback(err);
  });
};

module.exports.raw = true; // get buffer stream instead of utf8 string