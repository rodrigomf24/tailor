'use strict';
const sax = require('sax');
const selfClosingBaseTags = [
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
];
const stream = require('stream');

function serializeTag (tag) {
    let res = '<';
    res += tag.name;
    Object.keys(tag.attributes).forEach((key) => {
        res += ' ' + key + '="' + tag.attributes[key] + '"';
    });
    res += '>';
    return res;
};

module.exports = class ParserStream extends stream.Transform {

    constructor (optionalSpecialTags, optionalInsertPipeBeforeTags) {
        super({objectMode: true});
        const insertPipeBeforeTags = optionalInsertPipeBeforeTags || [];
        const specialTags = optionalSpecialTags || [];
        const selfClosingTags = selfClosingBaseTags.concat(specialTags);
        let buffer = '';
        let insertPipe = false;
        let closedBody = false;
        const pushBuffer = () => {
            if (buffer !== '') {
                this.push(new Buffer(buffer));
                buffer = '';
            }
        };

        this.parser = sax.parser(false, {lowercase: true, position: false});

        Object.assign(this.parser, {
            onopentag: (tag) => {
                if (!insertPipe && ~insertPipeBeforeTags.indexOf(tag.name)) {
                    pushBuffer();
                    this.push({placeholder: 'pipe'});
                    insertPipe = true;
                }
                if (~specialTags.indexOf(tag.name)) {
                    try {
                        pushBuffer();
                        this.push(tag);
                    } catch (err) {
                        this.emit('error', err);
                    }
                } else {
                    buffer += serializeTag(tag);
                }
            },
            onclosetag: (tagName) => {
                if (~specialTags.indexOf(tagName)) {
                    pushBuffer();
                    this.push({closingTag: tagName, attributes: {}});
                }
                if (tagName === 'body') {
                    pushBuffer();
                    this.push({placeholder: 'async'});
                    closedBody = true;
                }
                if (!~selfClosingTags.indexOf(tagName)) {
                    buffer += '</' + tagName + '>';
                }
            },
            ondoctype: () => {
                buffer += '<!DOCTYPE html>';
            },
            ontext: (text) => {
                buffer += text;
            },
            onscript: (script) => {
                buffer += script;
            },
            onend: () => {
                pushBuffer();
                if (!closedBody) {
                    this.push({placeholder: 'async'});
                }
            },
            onerror: (error) => {
                this.emit('error', error);
                this.parser.error = null;
                this.parser.resume();
            }
        });

    }

    _transform (chunk, enc, done) {
        this.parser.write(chunk.toString());
        done();
    }

    _flush (done) {
        this.parser.close();
        done();
    }

};
