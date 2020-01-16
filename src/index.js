// @flow

const path = require('path');
const loaderUtils = require('loader-utils');
const fs = require('fs');
const MIMES = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'svg': 'image/svg+xml'
};

const EXTS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};


type Config = {
  size: string | number | void,
  sizes: [string | number] | void,
  min: string | number | void,
  max: string | number | void,
  steps: string | number | void,
  name: string | void,
  outputPath: Function | string | void,
  publicPath: Function | string | void,
  context: string | void,
  placeholderSize: string | number | void,
  quality: string | number | void,
  background: string | number | void,
  placeholder: string | boolean | void,
  adapter: ?Function,
  format: 'png' | 'jpg' | 'jpeg',
  disable: ?boolean,
  transformedFormats: Array
};

const getOutputAndPublicPath = (fileName: string, { outputPath: configOutputPath, publicPath: configPublicPath }: Config) => {
  let outputPath = fileName;

  if (configOutputPath) {
    if (typeof configOutputPath === 'function') {
      outputPath = configOutputPath(fileName);
    } else {
      outputPath = path.posix.join(configOutputPath, fileName);
    }
  }

  let publicPath = `__webpack_public_path__ + ${JSON.stringify(outputPath)}`;

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

module.exports = function loader(content: Buffer) {
  const loaderCallback = this.async();
  const parsedResourceQuery = this.resourceQuery ? loaderUtils.parseQuery(this.resourceQuery) : {};
  const config: Config = Object.assign({}, loaderUtils.getOptions(this), parsedResourceQuery);
  const outputContext: string = config.context || this.rootContext || this.options && this.options.context;
  const outputPlaceholder: boolean = Boolean(config.placeholder) || false;
  const placeholderSize: number = parseInt(config.placeholderSize, 10) || 40;
  const transformedFormats: Array = config.transformedFormats || [];
  // JPEG compression
  const quality: number = parseInt(config.quality, 10) || 85;
  // Useful when converting from PNG to JPG
  const background: string | number | void = config.background;
  // Specify mimetype to convert to another format
  let mime: string;
  let ext: string;
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

  const name = (config.name || '[hash]-[width].[ext]').replace(/\[ext\]/ig, ext);
  const adapter: Function = config.adapter || require('./adapters/jimp');
  const loaderContext: any = this;

  // The config that is passed to the adatpers
  const adapterOptions = Object.assign({}, config, {
    quality,
    background
  });

  const min: number | void = config.min !== undefined ? parseInt(config.min, 10) : undefined;
  const max: number | void = config.max !== undefined ? parseInt(config.max, 10) : undefined;
  const steps: number = config.steps === undefined ? 4 : parseInt(config.steps, 10);

  let generatedSizes;
  if (typeof min === 'number' && max) {
    generatedSizes = [];

    for (let step = 0; step < steps; step++) {
      const size = min + (max - min) / (steps - 1) * step;
      generatedSizes.push(Math.ceil(size));
    }
  }

  const sizes = parsedResourceQuery.size || parsedResourceQuery.sizes || generatedSizes || config.size || config.sizes || [Number.MAX_SAFE_INTEGER];

  if (!sizes) {
    return loaderCallback(null, content);
  }

  const originalFileName = loaderUtils.interpolateName(loaderContext, name, {
    context: outputContext,
    content: content
  }).replace(/-\[width\]/ig, '');

  const { publicPath: originalFilePublicPath } = getOutputAndPublicPath(originalFileName, config);


  if (config.disable) {
    // emit original content only
    const fileName = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: content
    })
      .replace(/\[width\]/ig, '100')
      .replace(/\[height\]/ig, '100');

    const { outputPath, publicPath } = getOutputAndPublicPath(fileName, config);

    loaderContext.emitFile(outputPath, content);

    return loaderCallback(null, 'module.exports = {srcSet:' + publicPath + ',images:[{path:' + publicPath + ',width:100,height:100}],src: ' + publicPath + ',toString:function(){return ' + publicPath + '}};');
  }

  const createFile = ({ data, width, height, mime }) => {
    let fileName = loaderUtils.interpolateName(loaderContext, name, {
      context: outputContext,
      content: data
    });


    let type = null;

    if (mime === MIMES.svg) {

      fileName = fileName
        .replace(/-\[width\]/ig, '')
        .replace(/\[height\]/ig, '');
    } else {
      fileName = fileName
        .replace(/\[width\]/ig, width)
        .replace(/\[height\]/ig, height);

      if (mime === MIMES.webp) {
        fileName += ".webp";
        type = MIMES.webp;

      }
    }
    const { outputPath, publicPath } = getOutputAndPublicPath(fileName, config);

    loaderContext.emitFile(outputPath, data);

    if (mime === MIMES.svg) {
      const src = publicPath;

      return {
        src,
        path: publicPath
      };
    } else {
      const src = publicPath + `+${JSON.stringify(` ${width}w`)}`;

      return {
        src,
        type,
        path: publicPath,
        width: width,
        height: height
      };
    }

  };

  const createPlaceholder = ({ data }: { data: Buffer }) => {
    const placeholder = data.toString('base64');
    return JSON.stringify('data:' + (mime ? mime + ';' : '') + 'base64,' + placeholder);
  };

  const img = adapter(loaderContext.resourcePath);
  return img.metadata()
    .then((metadata) => {

      let promises = [];
      const widthsToGenerate = new Set();

      (Array.isArray(sizes) ? sizes : [sizes]).forEach((size) => {
        const width = Math.min(metadata.width, parseInt(size, 10));

        // Only resize images if they aren't an exact copy of one already being resized...
        if (!widthsToGenerate.has(width)) {
          widthsToGenerate.add(width);

          if (mime !== MIMES.svg) {//svg does not required to resize
            promises.push(img.resize({
              width,
              mime,
              options: adapterOptions
            }));
          }

          if (transformedFormats.length > 0) {
            transformedFormats.forEach(format => {
              if (MIMES[format]) {
                promises.push(img.resize({
                  width,
                  mime: MIMES[format],
                  options: adapterOptions
                }));
              }
            })
          }

        }
      }


      );

      if (outputPlaceholder && mime !== MIMES.svg) {

        promises.push(img.resize({
          width: placeholderSize,
          options: adapterOptions,
          mime
        }));
      }





      return Promise.all(promises)
        .then(results => outputPlaceholder && mime !== MIMES.svg
          ? {
            files: results.slice(0, -1).map(createFile),
            placeholder: createPlaceholder(results[results.length - 1])
          }
          : {
            files: results.map(createFile)
          }
        );
    })
    .then(({ files, placeholder }) => {
      const srcSetGroups = files.reduce((result, f) => {
        if (f.type) {
          (result[f.type] || (result[f.type] = [])).push(f);
        }
        else {
          result.default.push(f);
        }
        return result;
      }, { default: [] })


      //let images = '';
      let srcSetsToString = '';
      for (const [key, value] of Object.entries(srcSetGroups)) {

        const srcset = value.map(f => f.src).join('+","+');

        if (key !== "default") {
          srcSetsToString = '{srcset:' + srcset + ',type:"' + key + '"},' + srcSetsToString;//add to beginning

        } else if (srcset.length > 0) {
          srcSetsToString += '{srcset:' + srcset + '}';
        }


        // images += value.map(f => '{path:' + f.path + ',width:' + f.width + ',height:' + f.height + '}').join(',')
      }


      const firstImage = files[0];

      srcSetsToString = '[' + srcSetsToString + ']';


      if (mime === MIMES.svg) {

        fs.copyFile(loaderContext.resourcePath, `dist/${originalFileName}`, (err) => {
          if (err) throw err;
          console.log('source.txt was copied to destination.txt');
        });

        loaderCallback(null, 'module.exports = {' +
          'srcSets:' + srcSetsToString + ',' +
          //   'images:[' + images + '],' +
          'src:' + originalFilePublicPath + ',' +
          'toString:function(){return ' + originalFilePublicPath + '},' +

          '};');
      } else {
        loaderCallback(null, 'module.exports = {' +
          'srcSets:' + srcSetsToString + ',' +
          //   'images:[' + images + '],' +
          'src:' + firstImage.path + ',' +
          'toString:function(){return ' + firstImage.path + '},' +
          'placeholder: ' + placeholder + ',' +
          'width:' + firstImage.width + ',' +
          'height:' + firstImage.height +
          '};');
      }

    })
    .catch(err => loaderCallback(err));
};

module.exports.raw = true; // get buffer stream instead of utf8 string
