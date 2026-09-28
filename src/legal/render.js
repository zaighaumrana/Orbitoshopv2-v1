import { escapeHTML as esc } from '../html.js'

// Canonical documents use headings, paragraphs and lists. Raw HTML never executes.
export function renderDocument(text) {
  let index = 0
  const contents = []
  const body = text.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).map(block => {
    const heading = /^(#{1,3}) (.+)$/.exec(block)
    if (heading) {
      const level = heading[1].length
      const id = 'section-' + (++index)
      if (level > 1) contents.push({id,title:heading[2]})
      return `<h${level} id="${id}">${esc(heading[2])}</h${level}>`
    }
    const lines = block.split('\n')
    if (lines.every(line => /^- /.test(line))) return '<ul>' + lines.map(line=>`<li>${esc(line.slice(2))}</li>`).join('') + '</ul>'
    if (lines.every(line => /^\d+\. /.test(line))) return '<ol>' + lines.map(line=>`<li>${esc(line.replace(/^\d+\. /,''))}</li>`).join('') + '</ol>'
    return `<p>${esc(block).replace(/\n/g,'<br>')}</p>`
  }).join('\n')
  return {body, contents}
}
