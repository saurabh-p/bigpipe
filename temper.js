'use strict';

var path = require('path');

/**
 * Temper can compile templates.
 *
 * @constructor
 * @api public
 */
function Temper() {
  this.cache = Object.create(null);       // File cache.
  this.installed = Object.create(null);   // Installed module for extension cache.
  this.required = Object.create(null);    // Template engine require cache.
}

/**
 * List of supported templates engines mapped by file extension for easy
 * detection.
 *
 * @type {Object}
 * @private
 */
Temper.prototype.supported = {
  '.ejs': ['ejs'],
  '.jade': ['jade'],
  '.mustache': ['hogan.js', 'mustache', 'handlebars']
};

/**
 * Require a cached require, or require it normally.
 *
 * @param {String} engine Module name.
 * @return {Mixed} The module.
 * @api private
 */
Temper.prototype.require = function requires(engine) {
  if (engine in this.required) return this.required[engine];

  try { this.required[engine] = require(engine); }
  catch (e) {
    throw new Error('The '+ engine +' module isnt installed. Run npm install --save '+ engine);
  }

  return this.required[engine];
};

/**
 * Discover which template engine we need to use for the given file path.
 *
 * @param {String} file The filename.
 * @returns {String} Name of the template engine.
 * @api private
 */
Temper.prototype.discover = function discover(file) {
  var extname = path.extname(file)
    , list = this.supported[extname]
    , temper = this
    , found;

  //
  // Already found a working template engine for this extensions. Use this
  // instead of trying to require more pointless template engines.
  //
  if (extname in this.installed) return this.installed[extname];

  //
  // A unknown file extension, we have no clue how to process this, so throw.
  //
  if (!list) throw new Error('Unknown file extensions, cannot detect template engine.');

  found = list.filter(function filter(engine) {
    var compiler;

    try { compiler = temper.require(engine); }
    catch (e) { return false; }

    temper.required[engine] = compiler;
    temper.installed[extname] = engine;

    return true;
  });

  if (found.length) return found[0];

  //
  // We couldn't find any valid template engines for the given file. Prompt the
  // user to install one of our supported template engines.
  //
  throw new Error('No valid template engine installed, please install '+ list.join('or'));
};

/**
 * Compile a given template to a server side and client side component.
 *
 * @param {String} template The templates content.
 * @param {String} engine The name of the template engine.
 * @param {String} name The filename without extension.
 * @returns {Object}
 * @api private
 */
Temper.prototype.compile = function compile(template, engine, name) {
  var compiler = this.require(engine)
    , library, directory, server, client;

  switch (engine) {
    case 'hogan.js':
      //
      // Create a unform interface for the server, which is a function that just
      // receieves data and renders a template. So we need to create a closure
      // as binding data is fucking slow.
      //
      server = (function hulk(template) {
        return function render(data) {
          return template.render(data);
        };
      })(compiler.compile(template));

      //
      // Create a uniform interface for the client, same as for the server, we
      // need to wrap it in a closure.
      //
      client = [
        '(function hulk() {',
          'var template = new Hogan.Template(',
            compiler.compile(template, { asString: 1 }),
          ');',
        'return function render(data) { return template.render(data); };'
      ].join('');

      directory = path.dirname(require.resolve(engine));
      library = path.join(directory, 'template.js');
    break;

    case 'handlebars':
      server = compiler.compile(template);
      client = compiler.precompile(template);

      directory = path.dirname(require.resolve(engine));
      library = path.join(directory, '..', 'dist', 'handlebars.runtime.js');
    break;

    case 'ejs':
      server = compiler.compile(template);

      //
      // Compiling a client is just as simple as for the server, it just
      // requires a little bit of .toString() magic to make it work.
      //
      client = compiler.compile(template, {
        client: true,       // Ensure we export it for client usage.
        compileDebug: false // No debug code plx.
      }).toString().replace('function anonymous', 'function ' + name);
    break;

    case 'jade':
      server = compiler.compile(template);

      //
      // Compiling a client is just as simple as for the server, it just
      // requires a little bit of .toString() magic to make it work.
      //
      client = compiler.compile(template, {
        client: true,       // Ensure we export it for client usage.
        pretty: true,       // Make the code pretty by default.
        compileDebug: false // No debug code plx.
      }).toString().replace('function anonymous', 'function ' + name);

      directory = path.dirname(require.resolve(engine));
      library = path.join(directory, 'runtime.js');
    break;
  }

  return {
    library: library ? this.read(library) : '',   // Front-end library.
    client: client,                               // Pre-compiled code.
    server: server                                // Compiled template.
  };
};

//
// Expose temper.
//
module.exports = Temper;
