//====================================================================

var theMap;
var mapMaxZoom = 15;

var xf;
var nsamplesDim;
var nsamplesGroup;
var ageDim;
var ageGroup;
var originDim;
var originGroup;
var materialDim;
var materialGroup;

var editor;

var displayedId = -1;
var displayedData = {};

var select1;
var select2;

var workerDim;
var sampleNameDim;

var imgMarker = 'img/marker.png',
    imgMarkerHighlight = 'img/marker_highlight.png';

var Ocean_color = "#81a6d3";
var Ferns_color = "#afa393";
var Tree_color = "#568e14";
var Trees_color = Tree_color;
var Herbs_color = "#ff7f50";
var Unkown_color = "#FF4400";

var blockMetaTable = false;

var groupColors = {
    "Trees & Shrubs": Trees_color,
    "Herbs": Herbs_color,
    "Ferns": Ferns_color,
    "Aquatics": Ocean_color
}

var defaultEditorProperties = {}

var diagramJSON = {};

var mapMarkers = {};

// Query parameters
var user_commit, user_branch, user_repo, user_meta_file;

// data specifiers
var repo_url = 'data/',
    meta_file = 'meta.tsv',
    data_repo = 'EMPD2/EMPD-data';

dc.config.defaultColors(d3.schemeRdBu[11])

//====================================================================
$(document).ready(function() {

  const urlParams = new URLSearchParams(window.location.search);
  user_commit = urlParams.get('commit');
  user_branch = urlParams.get('branch');
  user_repo = urlParams.get('repo');
  user_meta_file = urlParams.get('meta');

  data_repo = user_repo ? user_repo : 'EMPD2/EMPD-data';
  meta_file = user_meta_file ? user_meta_file : 'meta.tsv'

  if (user_commit) {
      repo_url = 'https://raw.githubusercontent.com/' + data_repo + '/' + user_commit + '/';
      user_branch = 'master';
  } else if (user_branch) {
      repo_url = 'https://raw.githubusercontent.com/' + data_repo + '/' + user_branch + '/';
  } else if (user_repo) {
      user_branch = 'master';
      repo_url = 'https://raw.githubusercontent.com/' + data_repo + '/' + user_branch + '/';
  } else {
      repo_url = 'data/';
      user_branch = 'master';
  }

  d3.tsv(repo_url + meta_file, function(d,i) {
      d.Id = i+1;
      d.Longitude = +d.Longitude;
      d.Latitude = +d.Latitude;
      d.Selected = false;
      d.Edited = false;

    // Limit latitudes according to latitude map range (-85:85)
      if (d.Latitude < -85) d.Latitude = -85;
      if (d.Latitude > 85) d.Latitude = 85;
      for (var key in d) {
          d[key] = typeof d[key] !== 'undefined' ? d[key] : '';
      }
      return d;
  }).then(function(data){

    initCrossfilter(data);

    theMap = mapChart.map();

    new L.Control.MousePosition({lngFirst: true}).addTo(theMap);
    new L.Control.zoomHome({homeZoom: 3, homeCoordinates: [60, 69]}).addTo(theMap);

    mapmadeUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    mapmade = new L.TileLayer(mapmadeUrl, { maxZoom: mapMaxZoom+1});
    new L.Control.MiniMap(mapmade, { toggleDisplay: true, zoomLevelOffset: -4 }).addTo(theMap);

    $('.leaflet-control-zoomhome-home')[0].click();

    //----------------------------------------------------------------
    // Events handling
    $('#button_cartadd').click(function() {
      	selection = tableDim.top(Infinity);
            selection.forEach(function(d) {
    		data[d.Id -1].Selected = true;
    	});
            dataTable.redraw();
        });

    $('#button_cartdelete').click(function() {
        data.forEach(function(d,i) { d.Selected = false; });
        dataTable.redraw();
    });

    $('#button_shipping').mouseover(function() {
        nbSelection = 0;
        data.forEach(function(d,i) {
            if (d.Selected == true) nbSelection++;
        });
        downloadType = document.getElementById("download-type").value;
        $('#button_shipping').prop('title', 'Deliver ' + downloadType + ' of cart as tab-separated file (currently ' + nbSelection.toString() + ' items)');
    });

    $("#button_shipping").click(function() {

    var downloadType = document.getElementById("download-type").value;

    if (downloadType == "data") {
        var sampleNames = []
        data.forEach(function(d) {if (d.Selected == true) sampleNames.push(d.SampleName);});

        function ignoreError(task, callback) {
          task(function(error, result) {
              if (error) console.error(error);
              return callback(null, result); // ignore error, e.g. 404-ing
          });
        }

        var promises = [];

        sampleNames.forEach(function(sampleName) {promises.push(d3.tsv(
            repo_url + 'samples/' + sampleName + '.tsv',
            function(d) {d.samplename = sampleName; return d;}))
        });

        Promise.all(promises).then(function(data) { downloadJSON(data.flat(), 'data.tsv')});
     } else {
        downloadJSON(data.filter(function(d){return d.Selected == true}), 'metadata.tsv')
     }

    });

    $("#download-edits").click(function() {
        downloadJSON(data.filter(function(d){return d.Edited == true}),
                     'metadata.tsv');
    });

    if (data_repo == 'EMPD2/EMPD-data' && user_branch == 'master') {
        document.getElementById("submit-instructions").innerHTML += (
            " Please download the metadata using the button below and send it via mail."
        );
        $("#submit-form").hide();
    } else {
        document.getElementById("submit-instructions").innerHTML += (
            " You can download the metadata using the button below and send it via mail, or you submit it by filling out the form below. Note that the latter  is only possible if the pull request has the label <code>viewer-editable</code>. You can set this label if you write <code>@EMPD-admin allow-edits</code> in a comment in this PR."
        );
    }

    // load diagram on popup
    theMap.on('popupopen', function(event) {
        Id = event.popup._source.key[2] - 1;
        displayedId = data[Id].Id;
        displayedData = data[Id];
        highlightDisplayed();

        var pollenData = [];
        d3.tsv(repo_url + 'samples/' + data[Id].SampleName + '.tsv').then(function(taxa_data) {

            blockMetaTable = true;
            $('#meta-tabs a[href="#pollen-plot"]').tab('show');

            document.getElementById("pollen-diagram").innerHTML = "<svg/>";
            document.getElementById("pollen-diagram-legend").innerHTML = "<svg/>";
            // document.getElementById("map-row").style.height = "800px";
            plotPollen(taxa_data.filter(d => d.make_percent.toLowerCase() == "true"), "pollen-diagram");
            plotPollenLegend('pollen-diagram-legend');
        });

    });
    theMap.on('popupclose', function(event) {
        Id = event.popup._source.key[2] - 1;
        document.getElementById("pollen-diagram").innerHTML = "";
        document.getElementById("pollen-diagram-legend").innerHTML = "";
        if (editor.root.collapsed == false) {
            editor.root.toggle_button.click();
        }
        blockMetaTable = false;
        displayedId = -1;
        displayedData = {};
        highlightDisplayed();
    });

    // Add ellipses for long entries and make DOI a hyperlink to google scholar
    $('#chart-table').on('mouseover', '.dc-table-column', function() {
      // displays popup only if text does not fit in col width
      if (this.offsetWidth < this.scrollWidth) {
        d3.select(this).attr('title', d3.select(this).text());
      }
    });

    // Make DOI a hyperlink to google scholar and handle selection
    $('#chart-table').on('click', '.dc-table-column', function() {
      column = d3.select(this).attr("class");
      if (column == "dc-table-column _0") {
          Id = d3.select(this.parentNode).select(".dc-table-column._1").text();
         	data[Id-1].Selected = d3.select(this).select('input').property('checked');
      } else {
          Id = d3.select(this.parentNode).select(".dc-table-column._1").text();
      	  dataTable.filter(Id);
      	  dc.redrawAll();
      	  // make reset link visible
          d3.select("#resetTableLink").style("display", "inline");
      }
    });

    markers = mapChart.markerGroup();
    markers.on('clustermouseover', function (a) {
      childMarkers = a.layer.getAllChildMarkers();
      childMarkersIds = childMarkers.map(function(obj) {return obj.key[2]}).sort();

      if (!blockMetaTable) {
          childMarkersIds.forEach(function(Id, i) {
          	d3.selectAll(".dc-table-column._1")
          		.text(function (d) {
          	     		if (parseInt(d.Id) == Id) {
          				if (i==0) this.parentNode.scrollIntoView();  // scroll for first
          	                 	d3.select(this.parentNode).style("font-weight", "bold");
                        document.getElementById('wrap').scrollIntoView();
          	               	}
          	     		return d.Id;
                  	});
          });
      }
    });
    markers.on('clustermouseout', function (a) {
      highlightDisplayed();
    });

    // fill default properties
    ["Longitude", "Latitude", "Elevation", "AreaOfSite", "AgeBP"].forEach(
        function(numberField) {
            defaultEditorProperties[numberField] = {
                "type": "number",
            };
        }
    );
    defaultEditorProperties["Longitude"]["maximum"] = 360.;
    defaultEditorProperties["Longitude"]["minimum"] = -180.;
    defaultEditorProperties["Latitude"]["maximum"] = 90;
    defaultEditorProperties["Latitude"]["minimum"] = -90;
    defaultEditorProperties["AreaOfSite"]["minimum"] = 0;

    // fill boolean properties
    ['ispercent', 'Selected', 'Edited'].forEach(function (booleanField) {
        defaultEditorProperties[booleanField] = {
            "type": "boolean",
            "format": "checkbox",
        };
    });

    // fill fixed tables
    var promises = [];
    var fixedMap = {
        "LocationReliability": "Location Reliability",
        "SampleContext": "Sample Context",
        "GroupID": "groupid",
        "Country": "Country",
        "SampleType": "SampleType",
        "AgeUncertainty": "Age Uncertainty",
        "SampleMethod": "CollectionMethod"
    };

    Object.keys(fixedMap).forEach(function (name) {
        var colname = fixedMap[name];
        defaultEditorProperties[name] = {
            "type": "string",
            "enum": [""],
        };
        promises.push(d3.tsv(
            repo_url + 'postgres/scripts/tables/' + name + '.tsv',
            function(d) {
                defaultEditorProperties[name]["enum"].push(
                    d[colname]);
                return d;
            }));
    });

    var workers = ['Worker1', 'Worker2', 'Worker3', 'Worker4'];
    workers.forEach(function (worker) {
        defaultEditorProperties[worker + '_Role'] = {
            "type": "string",
            "enum": [""],
        };
        defaultEditorProperties[worker + '_Email1'] = {
            "type": "string",
            "format": "email",
        };
        defaultEditorProperties[worker + '_Email2'] = {
            "type": "string",
            "format": "email",
        };
    });

    promises.push(d3.tsv(
        repo_url + 'postgres/scripts/tables/WorkerRole.tsv',
        function(d) {
            workers.forEach(function(worker) {
                defaultEditorProperties[worker + '_Role']["enum"].push(
                    d["WorkerRole"]);
                });
                return d;
            }));

    Promise.all(promises).then(function(res) {
        console.log(defaultEditorProperties);
        var editor_element = document.getElementById('editor_holder');

        var editor_schema = {
            "type": "object",
            "title": "Edit meta data",
            "options": {
                "collapsed": true,
            },
            "properties": {}
        };

        for (var key in data[0]) {
            if (typeof defaultEditorProperties[key] !== 'undefined') {
                editor_schema["properties"][key] = defaultEditorProperties[key];
            } else {
                editor_schema["properties"][key] = {"type": "string"};
            }
        };
        editor = new JSONEditor(editor_element, {
            "theme": 'bootstrap3',
            "template": "handlebars",
            "iconlib": "bootstrap3",
            "no_additional_properties": true,
            "schema": editor_schema,
        });
        editor.disable();

        document.getElementById('btn-save').addEventListener(
            'click',function() {// Get the value from the editor
                var errors = editor.validate();

                if (errors.length) {
                  // errors is an array of objects, each with a `path`, `property`, and `message` parameter
                  // `property` is the schema keyword that triggered the validation error (e.g. "minLength")
                  // `path` is a dot separated path into the JSON object (e.g. "root.path.to.field")
                  console.log(errors);
                }
                else {
                    var value = editor.getValue();
                    value["Edited"] = true;
                    data[value.Id - 1] = value;
                }
        });
    });

    $("#submit-form").submit(function(e){
        var form = $(this);
        var rawForm = form.serializeArray();
        var formData = {};
        for (var i = 0; i < rawForm.length; i++){
            formData[rawForm[i]['name']] = rawForm[i]['value'];
        }

        formData["repo"] = data_repo;
        formData["branch"] = user_branch;
        formData["meta"] = meta_file;
        formData["metadata"] = data.filter(function(d){return d.Edited == true});

        grecaptcha.ready(function() {
            grecaptcha.execute('6LflGpsUAAAAAKhm3e-A5q30qh1099ZZeF884Vld',{action: 'submit_data'}).then(
                function(token) {
                    $("#submit-info").html("Please be patient, we are just dealing with your data. This may take one or two minutes and you should receive an email to " + formData.submitter_mail);
                    $("#submit-info").show();
                    formData["token"] = token;
                    $.post(form.attr('action'), JSON.stringify(formData)).then(
                        function(data, status) {
                            $("#submit-successed").html(status + ": " + data);
                            $("#submit-info").hide();
                            $("#submit-failed").hide();
                            $("#submit-successed").show();
                        },
                        function(jqxhr, status, errorThrown) {
                            $("#submit-failed").html(status + ": " + jqxhr.responseText);
                            $("#submit-info").hide();
                            $("#submit-successed").hide();
                            $("#submit-failed").show();
                    });
                });
        });
        return false;
    });

    $("#submit-info").hide();
    $("#submit-failed").hide();
    $("#submit-successed").hide();

  });

});

//====================================================================

function downloadJSON(data, fileName="data.tsv", exclude=["Selected", "Id", "Edited"]) {
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
    return doi ? '<a href="https://dx.doi.org/' + doi + '" target="_blank">' + doi + '</a>' : '';
}

function mailLink(samplename, mail, text) {
    return mail ? '<a href=mailto:' + mail + "?Subject=EMPD%20sample%20" + samplename + '>' + text + '</a>' : '';
}

//====================================================================

function formatNumberLength(num, length) {
    // Copied from https://stackoverflow.com/a/1127966
    var r = "" + num;
    while (r.length < length) {
        r = "0" + r;
    }
    return r;
}


function wrap(text) {
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

function plotPollen(data, elemId) {

    var svg = d3.select("#" + elemId).select("svg"),
        margin = {top: 40, right: 80, bottom: 180, left: 40},
        width = 1000 - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    svg
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", "0 0 960 240")

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        return `<strong>${d.acc_varname}</strong><br><br>` +
               "<table class='tooltip-table'>" +
               `<tr><td>Original name:</td><td>${d.original_varname}</td></tr>` +
               `<tr><td>Group: </td><td>${d.higher_groupname}</td></tr>` +
               `<tr><td>Percentage: </td><td>${(+d.percentage).toFixed(2)}%</td></tr>` +
               `<tr><td>Counts: </td><td>${d.count}</td></tr></table>`;
    });

    svg.call(tip);

    var nbars = data.length;
    var barWidth = width / nbars;
    var barPadding = 4;

    var x = d3.scaleOrdinal().range(Array.from(Array(nbars).keys()).map(function(d) {return (d+1) * barWidth;}));
    var y = d3.scaleLinear().rangeRound([height, 0]);

    var g = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var maxPollen = Math.max.apply(Math, data.map(d => +d.percentage));

    // to handle duplicated taxa names, we add the `index` to the name. This
    // will be removed later
    x.domain(data.map((d, i) => formatNumberLength(i, 2) + d.acc_varname));
    y.domain([0, maxPollen]);

    var xAxis = g => g
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .selectAll(".tick text")
            // remove the index (must be called before "wrap")
            .text((name) => name.substr(2))
            .attr("y", "0.15em")
            .attr("x", "-0.8em")
            .call(wrap)
            .attr("transform", "rotate(-65)" )
            .style("text-anchor", "end");

    var yAxis = g => g
        .attr("class", "axis axis--y")
        .call(d3.axisLeft(y).ticks(5))
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("x", -40)
        .attr("text-anchor", "middle")
        .text("Percentage[%]");

    g.append("g").call(xAxis);

    g.append("g").call(yAxis);

    g.selectAll(".bar")
      .data(data)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(+d.percentage))
        .attr("width", barWidth - barPadding)
        .attr("height", d => height - y(+d.percentage))
        .style("fill", d => groupColors[d.higher_groupname] || Unkown_color)
        .attr("transform", (d, i) => `translate(${barWidth * (i + 0.5) + barPadding / 2} , 0)`)
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);

    // Exaggerations
    g.append("g")
      .selectAll(".bar")
      .data(data)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(+d.percentage * 5 < maxPollen ? +d.percentage*5 : 0))
        .attr("width", barWidth - barPadding)
        .attr("height", d => height - y(+d.percentage * 5 < maxPollen ? +d.percentage*5 : 0))
        .style("stroke", d => groupColors[d.higher_groupname] || Unkown_color)
        .style("stroke-dasharray", ("10,3")) // make the stroke dashed
        .style("fill", "none")
        .attr("transform", (d, i) => `translate(${barWidth * (i + 0.5) + barPadding / 2} , 0)`);

    var groups = [], prev;
    data.forEach(function(d) {
        if (d.higher_groupname !== prev) {
            prev = d.higher_groupname;
            groups.push({'key': prev, 'count': 1})
        } else {
            groups[groups.length-1]['count']++;
        }
    });

    // groupname bars
    g.append("g")
      .selectAll(".bar")
      .data(groups)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", function(d) { return -margin.top+10; })
        .attr("width", function(d, i) { return (d.count) * barWidth; })
        .attr("height", 10)
        .style("fill", function(d) { return groupColors[d.key] || Unkown_color; })
        .attr("data-legend", function(d) { return d.key})
        .attr("transform", function(d, i) {
            var x = 0.5*barWidth + barPadding;
            for ( j = 0; j < i; j++ ) {
                x = x + groups[j].count * barWidth;
            }
            var translate = [x, 0];
            return "translate(" + translate + ")";
        });

}

function plotPollenLegend(elemId) {
    var svg = d3.select("#" + elemId).select("svg");

    legendPadding = 10;

    var g = svg.append("g").attr("class", "legend")
            .style("font-size", "18px")
            .attr("transform", "translate(25, 40)");

    var groups = ["Trees & Shrubs", "Herbs", "Ferns", "Aquatics",
                  "5-times exaggerated"];
    groups.forEach(function(text, i) {
        g.append("text")
            .attr("y", i+"em")
            .attr("x", "1em")
    	    .text(text);
        g.append("circle")
            .attr("cy", i-0.25+"em")
            .attr("cx", 0)
            .attr("r", "0.4em")
            .style("fill", groupColors[text] || "none")
            .style("stroke", i == groups.length-1 ? groupColors[groups[0]] : "none")
            .style("stroke-dasharray", i == groups.length-1 ? ("10,3") : "none");
    })

    var lbbox = g.node().getBBox();
    g.append("rect")
        .attr("x",(lbbox.x-legendPadding))
        .attr("y",(lbbox.y-legendPadding))
        .attr("height",(lbbox.height+2*legendPadding))
        .attr("width",(lbbox.width+2*legendPadding))
        .style("fill", "none")
        .style("stroke", "black");
}

function workerTooltip(last, first, address1, address2, email1, email2) {
    hasTooltip = (address1 != "" || address2 != "" || email1 != "" || email2 != "");
    ret = (hasTooltip ? "<div class='popuptooltip'>" : "");
    ret = ret + last + ", " + first;
    if (hasTooltip) {
            ret = ret + "<span class='tooltiptext'>";
            if (address1 != "") ret = ret + address1 + "</br></br>";
            if (address2 != "") ret = ret + address2 + "</br></br>";
            if (email1 != "") ret = ret + "Email: " + email1 + "</br>";
            if (email2 != "") ret = ret + "Email: " + email2 + "</br>";
            ret = ret + "</span></div>";
        }
    return ret
}


//====================================================================

function editDisplayed() {
    editor.setValue(displayedData);
    editor.enable();
    editor.getEditor('root.SampleName').disable();
    editor.getEditor('root.Id').disable();
    if (editor.root.collapsed == true) {
        editor.root.toggle_button.click();
    }
    $('#meta-tabs a[href="#meta-editor"]').tab('show');
    document.getElementById('meta-editor').scrollIntoView();
}

//====================================================================
// taken from https://stackoverflow.com/a/46181 on March 30th, 2019

function validateEmail(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

//====================================================================
// Paging functions for dataTable. Taken from
// http://dc-js.github.io/dc.js/examples/table-pagination.html
// on December, 4th 2018
var ofs = 0, pag = 100;

function update_offset() {
    var totFilteredRecs = xf.groupAll().value();
    var end = ofs + pag > totFilteredRecs ? totFilteredRecs : ofs + pag;
    ofs = ofs >= totFilteredRecs ? Math.floor((totFilteredRecs - 1) / pag) * pag : ofs;
    ofs = ofs < 0 ? 0 : ofs;
    dataTable.beginSlice(ofs);
    dataTable.endSlice(ofs+pag);
}
function display_page_buttons() {
    var totFilteredRecs = xf.groupAll().value();
    var end = ofs + pag > totFilteredRecs ? totFilteredRecs : ofs + pag;
    d3.select('#begin')
        .text(end === 0? ofs : ofs + 1);
    d3.select('#end')
        .text(end);
    d3.select('#prev-table-page')
        .attr('disabled', ofs-pag<0 ? 'true' : null);
    d3.select('#next-table-page')
        .attr('disabled', ofs+pag>=totFilteredRecs ? 'true' : null);
    d3.select('#size').text(totFilteredRecs);
    if(totFilteredRecs != xf.size()){
      d3.select('#totalsize').text("(filtered Total: " + xf.size() + " )");
    }else{
      d3.select('#totalsize').text('');
    }
}
function next_table_page() {
    ofs += pag;
    update_offset();
    dataTable.redraw();
}
function prev_table_page() {
    ofs -= pag;
    update_offset();
    dataTable.redraw();
}

//====================================================================
function initCrossfilter(data) {

  //-----------------------------------
  xf = crossfilter(data);

  //-----------------------------------
  nsamplesRange = [0., 200.];
  nsamplesBinWidth = 10.;
  nsamplesDim = xf.dimension( function(d) {
	// Threshold
	var nsamplesThresholded = d.nsamples;
    if (d.ismodern == 't') nsamplesThresholded = NaN;
	if (nsamplesThresholded <= nsamplesRange[0]) nsamplesThresholded = nsamplesRange[0];
	if (nsamplesThresholded >= nsamplesRange[1]) nsamplesThresholded = nsamplesRange[1] - nsamplesBinWidth;
	return nsamplesBinWidth*Math.floor(nsamplesThresholded/nsamplesBinWidth);
      });
  nsamplesGroup = nsamplesDim.group();

  //-----------------------------------
  sampleNameDim = xf.dimension(function(d) {
      return d.SampleName.split("_").slice(0, -1).join(" ");
  })

  //-----------------------------------
  workerDim = xf.dimension(function(d) {
      ret = [d.Worker1_LastName + ', ' + d.Worker1_FirstName];
      if (d.Worker2_LastName != "" && typeof d.Worker2_LastName !== 'undefined') ret.push(d.Worker2_LastName + ', ' + d.Worker2_FirstName);
      if (d.Worker3_LastName != "" && typeof d.Worker3_LastName !== 'undefined') ret.push(d.Worker3_LastName + ', ' + d.Worker3_FirstName);
      if (d.Worker4_LastName != "" && typeof d.Worker4_LastName !== 'undefined') ret.push(d.Worker4_LastName + ', ' + d.Worker4_FirstName);
      return ret
  }, true)

  //-----------------------------------
  mapDim = xf.dimension(function(d) { return [d.Latitude, d.Longitude, d.Id]; });
  mapGroup = mapDim.group();

  //-----------------------------------
  versionDim = xf.dimension( function(d) { return d.EMPD_version; });
  versionGroup = versionDim.group();

  //-----------------------------------
  tableDim = xf.dimension(function(d) { return +d.Id; });

  //-----------------------------------

  customMarker = L.Marker.extend({
    options: {
      Id: 'Custom data!'
    },
    setOpacity: function(opacity) {}  // disables changes in opacity
  });

  iconSize = [32,32];
  iconAnchor = [16,32];
  popupAnchor = [0,-32];

  mapChart  = dc.leafletMarkerChart("#chart-map");

  mapChart
      .width(2000)
      .height(600)
      .dimension(mapDim)
      .group(mapGroup)
      .center([60, 69])    // slightly different than zoomHome to have a info updated when triggered
      .zoom(3)
      .tiles(function(map) {			// overwrite default baselayer
	   return L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
                { attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community' }).addTo(map);
      })
      .mapOptions({maxZoom: mapMaxZoom, zoomControl: false})
      .fitOnRender(false)
      .filterByArea(true)
      .cluster(true)
      .clusterOptions({maxClusterRadius: 50, showCoverageOnHover: false, spiderfyOnMaxZoom: true})
      .title(function() {})
      .popup(function(d,marker) {
		Id = d.key[2] -1;
  		popup = L.popup({autoPan: false, closeButton: false, maxWidth: 300});
		popup.setContent(
                '<div class="container" style="width:300px">'
                + "Sample name: " + "<b>" + data[Id].SampleName + "</b></br>"
                + "<b>" + data[Id].Country + "</b></br></br>"
    			+ "Position: " + "<b>" + data[Id].Longitude.toFixed(2) + "°E</b>, <b>" + data[Id].Latitude.toFixed(2) + '°N</b> <div class="popuptooltip">(' + data[Id].LocationReliability + ')<span class="tooltiptext">Location reliability</span></div></br>'
                + "Elevation: <b>" + data[Id].Elevation + "</b> m a.s.l.</br>"
                + "Name: " + "<b>" + data[Id].SiteName + "</b></br>"
                + (data[Id].SampleType != ""  ? "Sampe type: " + data[Id].SampleType + "</br>" : "")
                + (data[Id].SampleContext != ""  ? "Sampe context: " + data[Id].SampleContext + "</br>" : "")
                + (data[Id].AgeBP != ""  ? "Age (BP): " + data[Id].AgeBP + "</br>" : "")
                + "</br>"
                + "Workers: " + workerTooltip(data[Id].Worker1_LastName, data[Id].Worker1_FirstName, data[Id].Worker1_Address1, data[Id].Worker1_Address2, data[Id].Worker1_Email1,  data[Id].Worker1_Email2)
                + mailLink(data[Id].SampleName, data[Id].Worker1_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + mailLink(data[Id].SampleName, data[Id].Worker1_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + (data[Id].Worker2_LastName != "" ? "; " + workerTooltip(data[Id].Worker2_LastName, data[Id].Worker2_FirstName, data[Id].Worker2_Address1, data[Id].Worker2_Address2, data[Id].Worker2_Email1,  data[Id].Worker2_Email2) : "")
                + mailLink(data[Id].SampleName, data[Id].Worker2_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + mailLink(data[Id].SampleName, data[Id].Worker2_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + (data[Id].Worker3_LastName != "" ? "; " + workerTooltip(data[Id].Worker3_LastName, data[Id].Worker3_FirstName, data[Id].Worker3_Address1, data[Id].Worker3_Address2, data[Id].Worker3_Email1,  data[Id].Worker3_Email2) : "")
                + mailLink(data[Id].SampleName, data[Id].Worker3_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + mailLink(data[Id].SampleName, data[Id].Worker3_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + (data[Id].Worker4_LastName != "" ? "; " + workerTooltip(data[Id].Worker4_LastName, data[Id].Worker4_FirstName, data[Id].Worker4_Address1, data[Id].Worker4_Address2, data[Id].Worker4_Email1,  data[Id].Worker4_Email2) : "")
                + mailLink(data[Id].SampleName, data[Id].Worker4_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + mailLink(data[Id].SampleName, data[Id].Worker4_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
                + "</br>"
                + (data[Id].Publication1 != "" ? "<details><summary><b>References...</b></summary><ul><li>" + data[Id].Publication1 + "</li>" : "")
                + (data[Id].Publication2 != "" ? "<li>" + data[Id].Publication2 + "</li>" : "")
                + (data[Id].Publication3 != "" ? "<li>" + data[Id].Publication3 + "</li>" : "")
                + (data[Id].Publication4 != "" ? "<li>" + data[Id].Publication4 + "</li>" : "")
                + (data[Id].Publication5 != "" ? "<li>" + data[Id].Publication5 + "</li>" : "")
                + (data[Id].Publication1 != "" ? "</ul></details>": "")
                + '<input class="btn pull-right" type="image" src="img/cartadd.png" title="Add this sample to the download cart" onclick="javascript:displayedData.Selected=true;dataTable.redraw();" style="height:30px;">'
                + '<input class="btn pull-right" type="image" src="img/pencil.png" title="Edit the meta information for this sample" onclick="javascript:editDisplayed();" style="height:30px;">'
                + '</div>'
            );
        mapMarkers[Id] = marker;

		return popup;
      })
      .marker(function(d,map) {
    	Id = d.key[2] -1;
		icon = L.icon({ iconSize: iconSize, iconAnchor: iconAnchor, popupAnchor: popupAnchor, iconUrl: imgMarker });

        marker = new customMarker([data[Id].Latitude, data[Id].Longitude], {Id: (Id+1).toString(), icon: icon});
        marker.on('mouseover', function(e) {
			iconUrlNew = imgMarkerHighlight;
			iconNew = L.icon({ iconSize: iconSize, iconAnchor: iconAnchor, popupAnchor: popupAnchor, iconUrl: iconUrlNew });
			e.target.setIcon(iconNew);
			d3.selectAll(".dc-table-column._1")
				.text(function (d, i) {
			     		if (parseInt(d.Id) == e.target.options.Id) {
                            if (blockMetaTable != true) {
                                $('#meta-tabs a[href="#meta-table"]').tab('show');
        						this.parentNode.scrollIntoView();
			                 	d3.select(this.parentNode).style("font-weight", "bold");
                                document.getElementById('wrap').scrollIntoView();
                            }
		               	}
			     		return d.Id;
		        	});
		});
        marker.on('mouseout', function(e) {
			iconUrlNew = imgMarker;
			iconNew = L.icon({ iconSize: iconSize, iconAnchor: iconAnchor, popupAnchor: popupAnchor, iconUrl: iconUrlNew });
			e.target.setIcon(iconNew);
			highlightDisplayed();
		});
        	return marker;
      });

  //-----------------------------------
  dataCount = dc.dataCount('#chart-count');

  dataCount
        .dimension(xf)
        .group(xf.groupAll())
        .html({
            some: '<strong>%filter-count</strong> selected out of <strong>%total-count</strong> records' +
                ' | <a href=\'javascript: resetAll_exceptMap();\'>Reset All</a>',
            all: 'All records selected. Please click on the graph to apply filters.'
        });

  //-----------------------------------
  dataTable = dc.dataTable("#chart-table");

  format1 = d3.format(".0f");
  format2 = d3.format(".2f");

  dataTable
    .dimension(tableDim)
    .group(function(d) {})
    .showGroups(false)
    .size(Infinity)
    // .size(xf.size()) //display all data
    .columns([
      d => d.Selected ? "<input type='checkbox' checked>" : "<input type='checkbox'>",
      d => d.Id ,
      d => d.SampleName,
      d => d.OriginalSampleName,
      d => d.SiteName,
      d => d.Country,
      d => d.Longitude,
      d => d.Latitude,
      d => d.Elevation,
      d => d.LocationReliability,
      d => d.LocationNotes,
      d => d.AreaOfSite,
      d => d.SampleContext,
      d => d.SiteDescription,
      d => d.VegDescription,
      d => d.SampleType,
      d => d.SampleMethod,
      d => d.AgeBP,
      d => d.AgeUncertainty,
      d => d.ispercent,
      d => d.Notes,
      d => d.Publication1,
      d => DOILink(d.DOI1),
      d => d.Publication2,
      d => DOILink(d.DOI2),
      d => d.Publication3,
      d => DOILink(d.DOI3),
      d => d.Publication4,
      d => DOILink(d.DOI4),
      d => d.Publication5,
      d => DOILink(d.DOI5),
      d => d.Worker1_Role,
      d => d.Worker1_LastName,
      d => d.Worker1_Initials,
      d => d.Worker1_FirstName,
      d => d.Worker1_Address1,
      d => d.Worker1_Address2,
      d => mailLink(d.SampleName, d.Worker1_Email1, d.Worker1_Email1),
      d => mailLink(d.SampleName, d.Worker1_Email2, d.Worker1_Email2),
      d => d.Worker1_Phone1,
      d => d.Worker1_Phone2,
      d => d.Worker2_Role,
      d => d.Worker2_LastName,
      d => d.Worker2_Initials,
      d => d.Worker2_FirstName,
      d => d.Worker2_Address1,
      d => d.Worker2_Address2,
      d => mailLink(d.SampleName, d.Worker2_Email1, d.Worker2_Email1),
      d => mailLink(d.SampleName, d.Worker2_Email2, d.Worker2_Email2),
      d => d.Worker2_Phone1,
      d => d.Worker2_Phone2,
      d => d.Worker3_Role,
      d => d.Worker3_LastName,
      d => d.Worker3_Initials,
      d => d.Worker3_FirstName,
      d => d.Worker3_Address1,
      d => d.Worker3_Address2,
      d => mailLink(d.SampleName, d.Worker3_Email1, d.Worker3_Email1),
      d => mailLink(d.SampleName, d.Worker3_Email2, d.Worker3_Email2),
      d => d.Worker3_Phone1,
      d => d.Worker3_Phone2,
      d => d.Worker4_Role,
      d => d.Worker4_LastName,
      d => d.Worker4_Initials,
      d => d.Worker4_FirstName,
      d => d.Worker4_Address1,
      d => d.Worker4_Address2,
      d => mailLink(d.SampleName, d.Worker4_Email1, d.Worker4_Email1),
      d => mailLink(d.SampleName, d.Worker4_Email2, d.Worker4_Email2),
      d => d.Worker4_Phone1,
      d => d.Worker4_Phone2
    ])
    .sortBy(function(d){ return +d.Id; })
    .order(d3.ascending)
    .on('preRender', update_offset)
    .on('preRedraw', update_offset)
    .on('pretransition', display_page_buttons);

    //-----------------------------------
    var versionColors = d3.scaleOrdinal()
      .domain(["EMPD1", "EMPD2"])
      .range(["#e34a33", Ocean_color]);   // http://colorbrewer2.org/

    versionChart  = dc.rowChart("#version-chart");

    versionChart
      .width(180)
      .height(100)
      .margins({top: 10, right: 10, bottom: 30, left: 10})
      .dimension(versionDim)
      .group(versionGroup)
      .colors(versionColors)
      .elasticX(true)
      .gap(2)
      .xAxis().ticks(4);

    //-----------------------------------

    select1 = dc.selectMenu('#select1')
        .dimension(sampleNameDim)
        .group(sampleNameDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------
    select2 = dc.selectMenu('#select2')
        .dimension(workerDim)
        .group(workerDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

  //-----------------------------------
  dc.renderAll();

}

// reset dataTable
function resetTable() {
  dataTable.filterAll();
  dc.redrawAll();
  // make reset link invisible
  d3.select("#resetTableLink").style("display", "none");
}

function submitData() {
    if (document.getElementById('submit-form').checkValidity()) {
        // grecaptcha.ready(function() {
        //     grecaptcha.execute('6LflGpsUAAAAAKhm3e-A5q30qh1099ZZeF884Vld',{action: 'homepage'}).then(
        //         function(token) {
        //
        //         });
        // });
        var payload = {};
        var form = document.forms['submit-form'];
        for (var key in form) {
            console.log(key);
        }

        // for (var i = 0; i < x.length; i++) {
        //
        // $.post('https://still-dusk-71857.herokuapp.com/empd-viewer/hook ',
        //     {
        //
        //     },
        //     function(data, status){console.log(data); console.log(status);});
    }
}

// reset all except mapChart
function resetAll_exceptMap() {
  select1.filterAll();
  select2.filterAll();
  // versionChart.filterAll();
  resetTable();
  dc.redrawAll();
}

//====================================================================
