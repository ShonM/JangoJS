Jango
=====

A very basic example while Jango is still under heavy development;

```coffeescript
jango = require 'Jango'
links = []

getLinks = ->
    links = document.querySelectorAll 'h3.r a'
    return Array::map.call links, (link) ->
        return link.getAttribute 'href'

jango.open 'http://www.google.fr/'

jango.evaluate ->
    document.forms[0].elements['q'].value = 'jango'
    return document.forms[0].submit()

jango.evaluate getLinks, (error, value) ->
    links = links.concat value

jango.evaluate ->
    document.forms[0].elements['q'].value = 'shonm'
    return document.forms[0].submit()

jango.evaluate getLinks, (error, value) ->
    links = links.concat value

jango.run ->
    console.log "#{links.length} links found"
    console.log " - #{links.join('\n - ')}"
    this.exit 1
```
