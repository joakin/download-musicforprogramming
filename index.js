var http = require('http')
var concat = require('concat-stream')
var domino = require('domino')
var fs = require('fs')
var path = require('path')
var log = require('single-line-log').stdout
var numeral = require('numeral')
var progress = require('progress-stream')

const toString = (x) => x.toString()

const url = 'http://musicforprogramming.net/'

var argv = require('minimist')(process.argv.slice(2))

init(argv)

function init (argv) {
  if (argv.i) {
    getIndex()
      .then((episodes) => {
        episodes.forEach((e) =>
          console.log(`${e.index} - ${e.text}`))
      })
      .catch((e) => console.log(e.stack))
  } else if (argv.f && argv.o) {
    var indexes = String(argv.f).split('-')
    var lowerIndex = indexes[0]
    var upperIndex = indexes[1] || lowerIndex
    var folder = argv.o
    fs.stat(folder, (err, stats) => {
      if (err) return console.log(err.message)
      if (!stats.isDirectory()) return console.log('Error: Not a folder')
      getIndex()
        .then((episodes) =>
          episodes.filter((e) =>
            (lowerIndex <= e.index && e.index <= upperIndex)))
        .then(getUrls)
        // .then((e) => console.log(e) || e)
        .then((episodes) => episodes.reduce((p, ep) =>
          p.then(() => getAudio(ep, folder)),
          Promise.resolve()))
        .catch((e) => console.log(e.stack))
    })
  } else if (argv._.length === 0) {
    help()
    process.exit(0)
  }
}

function help () {
  console.log(`
Episodes from musicforprogramming.net

    -i See the index
`)
}

function getIndex () {
  return get(url)
    .then(toString)
    .then(parseDom)
    .then(getLinks)
}

function get (url) {
  return new Promise((resolve, reject) =>
    http.get(url, (res) => {
      res.pipe(concat(resolve))
      res.on('error', reject)
    })
  )
}

function parseDom (str) {
  var window = domino.createWindow(str)
  return window.document
}

function getLinks (document) {
  return Array.from(document.querySelector('.multi-column').querySelectorAll('a'))
    .map(linkToData)
}

function linkToData (a) {
  var text = a.textContent
  return {
    url: a.href,
    text: text,
    index: parseInt(text.split(':')[0], 10)
  }
}

function getUrls (episodes) {
  return Promise.all(episodes.map((ep) =>
    get(url + ep.url).then(toString)
      .then(getAudioUrl)
      .then((url) => Object.assign({}, ep, {
        audio: url,
        fileName: url.split('/').pop()
      }))
  ))
}

function getAudioUrl (content) {
  return domino.createWindow(content).document.querySelector('audio').src
}

function getAudio (ep, folder) {
  return new Promise((resolve, reject) => {
    var audio = ep.audio
    var fileName = ep.fileName
    var filePath = path.join(folder, fileName)
    console.log(`Fetching ${audio}`)
    http.get(audio, (res) => {
      var str = progress({
        drain: true,
        time: 100,
        speed: 20
      }, printProgress)
      console.log(`Storing in ${filePath}`)
      var file = fs.createWriteStream(filePath)
      res.pipe(str)
      res.pipe(file)
      res.on('error', reject)
      file.on('error', reject)
      file.on('finish', () => {
        console.log('\n\n---\n')
        resolve()
      })
    })
  })
}

function printProgress (progress) {
  log(
`Running: ${numeral(progress.runtime).format('00:00:00')} (${numeral(progress.transferred).format('0 b')})
Left:    ${numeral(progress.eta).format('00:00:00')} (${numeral(progress.remaining).format('0 b')})
${numeral(progress.speed).format('0.00b')}/s ${Math.round(progress.percentage)}%`)
}
