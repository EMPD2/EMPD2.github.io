// utitliy functions

// Locked diagrams
var lockedElements = [];

// plotted diagrams
var lockableElements = [];

//====================================================================

function downloadJSON(data, fileName="data.tsv", exclude=["Selected", "Id", "Edited"]) {
	/**
	* Download a javascript object as tab-separated file
	*
	* @param {Object} data - The javascript object to download
	* @param {string} fileName - The name for the resulting file
	* @param {Array.<string>} exclude - Properties that shall be excluded
	*/
    var  columns = [...new Set(data.reduce((r, e) => [...r, ...Object.keys(e)], []))];
    var tsv = d3.tsvFormat(data, columns.filter(s => exclude.indexOf(s) === -1));
    var downloadLink = document.createElement("a");
    var blob = new Blob(["\ufeff", tsv]);
    var url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = fileName;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

//====================================================================
function DOILink(doi) {
	// Create a link to https://doi.org for the given DOI
    return doi ? '<a href="https://doi.org/' + doi + '" target="_blank">' + doi + '</a>' : '';
}

function mailLink(samplename, mail, text) {
	// Create an email link for a given sample for the given mail
    return mail ? '<a href=mailto:' + mail + "?Subject=EMPD%20sample%20" + samplename + '>' + text + '</a>' : '';
}

//====================================================================

function formatNumberLength(num, length) {
	/**
	* Format an integer with leading zeros.
	*
	* @param {integer} num - The number to format
	* @param {integer} length - The desired length
	*
	*@return {string} The formatted num
	*/
    // Copied from https://stackoverflow.com/a/1127966
    var r = "" + num;
    while (r.length < length) {
        r = "0" + r;
    }
    return r;
}


function wrap(text) {
	/**
	* Wrap a text and split it into multiple lines
	*
	* @param {string} text - The text to split
	*
	*@return {string} The splitted text
	*/
    // Copied from https://bl.ocks.org/ericsoco/647db6ebadd4f4756cae
    // on October 4th, 2018

    var width=120;

  text.each(function() {

    var breakChars = ['/', '&', '-'],
      text = d3.select(this),
      textContent = text.text(),
      spanContent;

    breakChars.forEach(char => {
      // Add a space after each break char for the function to use to determine line breaks
      textContent = textContent.replace(char, char + ' ');
    });

    var words = textContent.split(/\s+/).reverse(),
      word,
      line = [],
      lineNumber = 0,
      lineHeight = 1.1, // ems
      x = text.attr('x') || 0,
      y = text.attr('y'),
      dy = parseFloat(text.attr('dy') || 0),
      tspan = text.text(null).append('tspan').attr('x', x).attr('y', y).attr('dy', dy + 'em');

    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(' '));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        spanContent = line.join(' ');
        breakChars.forEach(char => {
          // Remove spaces trailing breakChars that were added above
          spanContent = spanContent.replace(char + ' ', char);
        });
        tspan.text(spanContent);
        line = [word];
        tspan = text.append('tspan').attr('x', x).attr('y', y).attr('dy', ++lineNumber * lineHeight + dy + 'em').text(word);
      }
    }
  });

}

//====================================================================

function highlightDisplayed() {
	// Highlight the selected samples in the data table
    d3.selectAll(".dc-table-row")
        .style("font-weight", "normal")
        .style("background", "#eee");

    if (displayedId > -1) {
        d3.selectAll(".dc-table-column._1")
            .text(function (d, i) {
                    if (parseInt(d.Id) == displayedId) {
                    this.parentNode.scrollIntoView();
                    d3.select(this.parentNode)
                        .style("font-weight", "bold")
                        .style("background", "#ccc");
                    document.getElementById('wrap').scrollIntoView();
                        }
                    return d.Id;
                });
    }
}

//====================================================================

function lockableElement(parent, entity, siteName) {
	/**
    * Create a container with a div that can be locked and removed
	*
	* This function adds two nodes to the given `parent`. The first one is a
	* title widget that is supposed to hold the title made up by
	* `siteName` and `entity`, and the second one can be used for anything
	* else
	*
	* @see removeUnlocked
	* @see lockElement
	*
	* @param {string} parent - The parent node ID
	* @param {string} entity - The entity (SampleName) that shall be used
	* @param {string} siteName - The name of the site
	*
	* @return {string} The node ID for the second created element
	*/
    var parentElem = document.getElementById(parent);
    var elemId = `${parent}-${entity}`
    if (lockableElements.includes(elemId)) {
        document.getElementById(elemId).scrollIntoView();
        return "";
    }
    parentElem.insertAdjacentHTML("afterbegin", `
        <ul class="list-inline list-group" id=${elemId}-title>
            <li>
                <button onclick='lockElement("${elemId}")' role="button" class="list-group-item" id="${elemId}-btn" title="Pin this Element"><span class="glyphicon glyphicon-lock" aria-hidden="true"></span></button>
            </li>
            <li>
                <h4 style="text-align:center;">${siteName} (${entity})</h4>
            </li>
        </ul>
        <br>
        <div id=${elemId}>
        </div>`);
    lockableElements.push(elemId)
    return elemId;
}

function lockElement(elemId) {
	/**
    * Lock or unlock an element created with lockableElement
	*
	* Elements that are locked are not removed by the `removeUnlocked` function
	*
	* @see lockableElement
	* @see removeUnlocked
	*
	* @param {string} elemId - The parent node ID used in lockableElement
	*/
    if (!lockedElements.includes(elemId)) {
        lockedElements.push(elemId);
    } else {
        lockedElements = lockedElements.filter(s => s != elemId);
    }
    $('#' + elemId + '-btn').button('toggle');
}

function removeUnlocked() {
	/**
    * Remove unlocked elements created with lockableElement
	*
	* Elements that are locked with the `lockElement` function are not removed
	* by this function
	*
	* @see lockableElement
	* @see lockElement
	*/
    lockableElements.filter(
        elemId => !lockedElements.includes(elemId)).forEach(
            function(elemId) {
                document.getElementById(elemId).remove();
                document.getElementById(`${elemId}-title`).remove();
            });
    lockableElements = lockableElements.filter(elemId => lockedElements.includes(elemId));
}

// ==================================================================

function jsonCopy(src) {
	// Make a copy of a javascript object
    return JSON.parse(JSON.stringify(src));
}
