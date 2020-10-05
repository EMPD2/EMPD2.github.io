//====================================================================

var theMap;
var mapMaxZoom = 15;

var xf;

// The cross filter dimensions
//
// array dimension for the workers
var workerDim,
    // dimension for the data contributor
    sampleNameDim,
    // dimension for the country
    countryDim,
    // dimension for the sample context
    sampleContextDim,
    // dimension for the sample type
    sampleTypeDim,
    // dimension for the sample method
    sampleMethodDim,
    // dimension for accepted failures
    okexceptDim,
    // binned dimension for the age uncertainty
    ageDim,
    // dimension for the location uncertainty
    locationDim,
    // dimensions for temperature values (DJF, MAM, JJA, SON, Annual)
    temperatureDims = [],
    // dimensions for precipitation values (DJF, MAM, JJA, SON, Annual)
    precipDims = [];

var temperatureGroups = [],
    precipGroups = [];

// The various charts for the crossfilter
//
// full meta data table
var dataTable,
    // formatted meta data table
    formattedDataTable,
    // leaflet map
    mapChart,
    // EMPD version
    versionChart,
    // country selection menu
    countryMenu,
    // sample context selection menu
    sampleContextMenu,
    // sample type selection menu
    sampleTypeMenu,
    // sample method selection menu
    sampleMethodMenu,
    // chart for the age uncertainty
    ageChart,
    // chart for the location uncertainty
    locationChart,
    // contributor selection menu
    contributorMenu,
    // worker selection menu
    workerMenu,
    // diagram for the temperature values
    temperatureChart,
    // diagram for the precipitation values
    precipChart,
    // selection menu for accepted failures
    okexceptMenu;

// all charts except the map
var allCharts;

// The initial center for the map
var mapCenter = [60, 69],
    mapZoom = 3;

// The x-limits and bin widths for the temperature chart
const temperatureRange = [-20, 40.];
const temperatureBinWidth = 2.;

// The x-limits and bin widths for the precipitation chart
const precipRange = [0, 150.];
const precipBinWidth = 1;

// The months as seasons as in the Temperature and Precipitation meta
// data properties
var monthsSeasons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
                     'Sep', 'Oct', 'Nov', 'Dec', 'DJF', 'MAM', 'JJA', 'SON', 'Ann'];

// The JSON editor to edit the meta data
var editor;

// The Id of the last displayed element
var displayedId = -1;

// The meta data of the last displayed sample
var displayedData = {};

// The path to the marker
var imgMarker = 'img/marker.png',
    imgMarkerHighlight = 'img/marker_highlight.png';

// EMPD version
var dataVersion = "stable";  // stable, latest or custum

// url for the latest and stable EMPD-data repository
var urlStable, urlLatest;

// default properties for the JSON editor
var defaultEditorProperties = {"Id": {"type": "integer", "required": true}}

// All markers on the map
var mapMarkers = {};

// Query parameters
var user_commit, user_branch, user_repo, user_meta_file;

// EMPD-data specifiers
var repo_url = 'data/',
    meta_file = 'meta.tsv',
    data_repo = 'EMPD2/EMPD-data';

// Pollen data that has been plotted
var plottedPollenData = {};  // The pollen data plotted

dc.config.defaultColors(d3.schemeRdBu[11])

//====================================================================
$(document).ready(function() {

    //-----------------------------------
    // setup the version buttons and get the url for the EMPD-data
    const urlParams = new URLSearchParams(window.location.search);
    user_commit = urlParams.get('commit');
    user_branch = urlParams.get('branch');
    user_repo = urlParams.get('repo');
    user_meta_file = urlParams.get('meta');

    data_repo = user_repo ? user_repo : 'EMPD2/EMPD-data';
    meta_file = user_meta_file ? user_meta_file : meta_file

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

    urlStable = location.protocol + "//" + location.host + location.pathname;
    urlLatest = urlStable + "?branch=master";
    document.getElementById("btn-stable").href = urlStable;
    document.getElementById("btn-latest").href = urlLatest;

    if (repo_url == 'data/') {
        document.getElementById("btn-stable").className += ' btn-primary';
        dataVersion = "stable";
        $("#version-info").hide();
    } else if (data_repo == "EMPD2/EMPD-data" && user_branch == "master") {
        document.getElementById("btn-latest").className += ' btn-primary';
        dataVersion = "latest";
        document.getElementById("version-info").innerHTML += (
          `This is the latest version of the EMPD from <a href="https://github.com/EMPD2/EMPD-data" class="alert-link">Github</a>. Please bear in mind that this data might be subject to change before the next release! To view the last stable version, click <a href="${urlStable}" class="alert-link">here</a>.`)
    } else {
        document.getElementById("btn-custom").className += ' btn-primary';
        dataVersion = "custom";
        $("#version-info").hide();
    }

    //-----------------------------------
    // load the meta data
    d3.tsv(repo_url + meta_file, parseMeta).then(function(data){

        // fill the groupInfo
        d3.tsv(
            repo_url + 'postgres/scripts/tables/GroupID.tsv', function (d) {
                if ("make_percent" in d) d.percent_values = d.make_percent;
                groupInfo[d.groupid] = d

                if (typeof(groupNames[d.groupid]) == "undefined") {
                    groupNames[d.groupid] = d.groupname;
                }
                return d;
            });

        // initialize the cross filter
        initCrossfilter(data);

        //-----------------------------------
        // Setup some controls for the map
        theMap = mapChart.map();

        // zoom home button
        L.easyButton('glyphicon-home', function(btn, map){
            map.setView(mapCenter, mapZoom);
        }, "Zoom home").addTo(theMap);

        mapmadeUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        mapmade = new L.TileLayer(mapmadeUrl, { maxZoom: mapMaxZoom+1});

        // minimap
        new L.Control.MiniMap(mapmade, { toggleDisplay: true, zoomLevelOffset: -4 }).addTo(theMap);

        // mouse position label to display latitude and longitude of the cursor
        new L.Control.MousePosition({
            lngFirst: true,
            position: "topright",
            numDigits: 2
        }).addTo(theMap);

        //----------------------------------------------------------------
        // Events handling for download management
        $('#button_cartadd').click(function() {
          	selection = tableDim.top(Infinity);
                selection.forEach(function(d) {
            data[d.Id -1].Selected = true;
        	});
                formattedDataTable.redraw();
                dataTable.redraw();
            });

        $('#button_cartdelete').click(function() {
            data.forEach(function(d,i) { d.Selected = false; });
            formattedDataTable.redraw();
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

        // display some information meta data editing
        if (dataVersion != "custom") {
            document.getElementById("submit-instructions").innerHTML += (
                " Please download the metadata using the button below and send it via mail."
            );
            $("#submit-form").hide();
        } else {
            document.getElementById("submit-instructions").innerHTML += (
                " You can download the metadata using the button below and send it via mail, or you submit it by filling out the form below. Note that the latter  is only possible if the pull request has the label <code>viewer-editable</code>. You can set this label if you write <code>@EMPD-admin allow-edits</code> in a comment in this PR."
            );
        }

        // hide issue reports for custom repositories
        if (dataVersion == "custom") {
            document.getElementById("report-instructions").innerHTML = (
                `Issues can only be submitted for the <a href="${urlStable}">stable</a> or <a href="${urlLatest}">latest</a> version.`
            );
            $("#report-form").hide();
        }

        // plot the pollen and climate data on popupopen
        theMap.on('popupopen', function(event) {
            Id = event.popup._source.key[2] - 1;
            displaySampleData(data[Id]);
        })

        theMap.on('popupclose', function(event) {
            Id = event.popup._source.key[2] - 1;
            if (editor.root.collapsed == false) {
                editor.root.toggle_button.click();
            }
            displayedId = -1;
            displayedData = {};
            highlightDisplayed();
        });

        ['chart-table', 'formatted-chart-table'].forEach(function(tableId) {
            // Add ellipses for long entries and make DOI a hyperlink to google scholar
            $('#' + tableId).on('mouseover', '.dc-table-column', function() {
              // displays popup only if text does not fit in col width
              if (this.offsetWidth < this.scrollWidth) {
                d3.select(this).attr('title', d3.select(this).text());
              }
            });

            // Make DOI a hyperlink to google scholar and handle selection
            $('#' + tableId).on('click', '.dc-table-column', function() {
              column = d3.select(this).attr("class");
              if (column == "dc-table-column _0") {
                  Id = d3.select(this.parentNode).select(".dc-table-column._1").text();
                 	data[Id-1].Selected = d3.select(this).select('input').property('checked');
              } else {
                  Id = d3.select(this.parentNode).select(".dc-table-column._1").text();
              	  dataTable.filter(Id);
              	  dc.redrawAll();
              	  // make reset link visible
                  d3.select("#resetFormattedTableLink").style("display", "inline");
                  d3.select("#resetTableLink").style("display", "inline");
              }
            });
        });

        markers = mapChart.markerGroup();
        markers.on('clustermouseover', function (a) {
            childMarkers = a.layer.getAllChildMarkers();
            childMarkersIds = childMarkers.map(function(obj) {return obj.key[2]}).sort();

            if ($('#meta-table').hasClass("active")) {
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
            };
        });
        markers.on('clustermouseout', function (a) {
            highlightDisplayed();
        });

        //------------------------------------------------------
        // JSON editor
        //
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

            // button to submit the data
            document.getElementById('btn-save').addEventListener(
                'click', function() {// Get the value from the editor
                    var errors = editor.validate();

                    if (errors.length) {
                      // errors is an array of objects, each with a `path`, `property`, and `message` parameter
                      // `property` is the schema keyword that triggered the validation error (e.g. "minLength")
                      // `path` is a dot separated path into the JSON object (e.g. "root.path.to.field")
                      console.log(errors);
                    }
                    else {
                        var value = editor.getValue();
                        var i = +value.Id - 1;
                        Object.keys(value).forEach(
                            function(key) {data[i][key] = value[key];}
                        );
                        var selected = value.Selected;

                        value = parseMeta(data[i], i);

                        value.Selected = selected;
                        value["Edited"] = true;
                        data[i] = value;
                        mapMarkers[value.Id - 1]._popup.setContent(getPopupContent(value));
                        resetData(value);
                    }
                });
        });

        $("#submit-form").submit(function(e){
            // Handle submitting the edited meta data
            // We first collect the edited meta data, ping the EMPD-admin and
            // submit the data
            var form = $(this);
            var rawForm = form.serializeArray();

            // setup the data that shall be submitted
            var formData = {};
            for (var i = 0; i < rawForm.length; i++){
                formData[rawForm[i]['name']] = rawForm[i]['value'];
            }

            formData["repo"] = data_repo;
            formData["branch"] = user_branch;
            formData["meta"] = meta_file;
            formData["metadata"] = data.filter(function(d){return d.Edited == true});

            // fail if grecaptcha is disabled
            if (typeof(grecaptcha) === "undefined") {
                $("#submit-failed").html(
                    "Please enable the javascript for Google Recaptcha to submit issues!");
                $("#submit-failed").show();
                $("#submit-successed").hide();
                $("#submit-info").hide();
                return false;
            }

            grecaptcha.ready(function() {
                grecaptcha.execute('6LflGpsUAAAAAKhm3e-A5q30qh1099ZZeF884Vld',{action: 'submit_data'}).then(
                    function(token) {
                        formData["token"] = token;

                        $("#submit-info").html(`Please be patient, I am pinging to EMPD-admin at <a href='${form.attr('action')}'>${form.attr('action')}</a> to see if it is awake. This may take up to two minutes...`);
                        $("#submit-failed").hide();
                        $("#submit-successed").hide();
                        $("#submit-info").show();

                        // Ping the EMPD-admin to see if it is awake
                        $.get(form.attr('action')).then(
                            // Ping succeeded
                            function(result, status) {

                                $("#submit-info").html("Please be patient, we are just dealing with your data. This may take one or two minutes and you should receive an email to " + formData.submitter_mail);

                                // Send the POST request
                                $.post(form.attr('action') + "/empd-viewer/hook", JSON.stringify(formData)).then(
                                    // Post succeeded
                                    function(result, status) {
                                        $("#submit-successed").html(status + ": " + result);
                                        data.forEach(function (d) {d.Edited = false;});
                                        $("#submit-info").hide();
                                        $("#submit-failed").hide();
                                        $("#submit-successed").show();
                                    },
                                    // Post failed
                                    function(jqxhr, status, errorThrown) {
                                        $("#submit-failed").html(status + ": " + jqxhr.responseText);
                                        $("#submit-info").hide();
                                        $("#submit-successed").hide();
                                        $("#submit-failed").show();
                                });
                            },
                            // Ping failed
                            function(jqxhr, status, errorThrown) {
                                $("#submit-failed").html("Could not reach the EMPD-admin<br>" + status + ": " + errorThrown);
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

        $("#report-form").submit(function(e){
            // Report an issue to the EMPD-admin
            var form = $(this);
            var rawForm = form.serializeArray();
            var formData = {};
            for (var i = 0; i < rawForm.length; i++){
                formData[rawForm[i]['name']] = rawForm[i]['value'];
            }

            formData["repo"] = data_repo;
            formData["branch"] = user_branch;

            // fail if grecaptcha is disabled
            if (typeof(grecaptcha) === "undefined") {
                $("#report-failed").html(
                    "Please enable the javascript for Google Recaptcha to submit issues!");
                $("#report-failed").show();
                $("#report-successed").hide();
                $("#report-info").hide();
                return false;
            }

            grecaptcha.ready(function() {
                grecaptcha.execute('6LflGpsUAAAAAKhm3e-A5q30qh1099ZZeF884Vld',{action: 'report_issue'}).then(
                    function(token) {
                        formData["token"] = token;
                        $("#report-info").html(`Please be patient, I am pinging to EMPD-admin at <a href='${form.attr('action')}'>${form.attr('action')}</a> to see if it is awake. This may take up to two minutes...`);
                        $("#report-failed").hide();
                        $("#report-successed").hide();
                        $("#report-info").show();

                        // Ping the EMPD-admin to see if it is awake
                        $.get(form.attr('action')).then(
                            // Ping succeeded
                            function(result, status) {
                                $("#report-info").html("Please be patient, we are just dealing with your report. This may take one or two minutes and you should receive an email to " + formData.submitter_mail);

                                // Send the POST request
                                $.post(form.attr('action') + "/empd-issues/hook", JSON.stringify(formData)).then(
                                    // Post succeeded
                                    function(result, status) {
                                        $("#report-successed").html(status + ": " + result);
                                        data.forEach(function (d) {d.Edited = false;});
                                        $("#report-info").hide();
                                        $("#report-failed").hide();
                                        $("#report-successed").show();
                                    },
                                    // Post failed
                                    function(jqxhr, status, errorThrown) {
                                        $("#report-failed").html("Could not deliver the report<br>" + status + ": " + jqxhr.responseText);
                                        $("#report-info").hide();
                                        $("#report-successed").hide();
                                        $("#report-failed").show();
                                });
                            },
                            // Ping failed
                            function(jqxhr, status, errorThrown) {
                                $("#report-failed").html("Could not reach the EMPD-admin<br>" + status + ": " + errorThrown);
                                $("#report-info").hide();
                                $("#report-successed").hide();
                                $("#report-failed").show();
                            });
                    });
            });
            return false;
        });

        $("#report-info").hide();
        $("#report-failed").hide();
        $("#report-successed").hide();

    });

    // Switch to a tab if a specific one is mentiond
    var activeTab = urlParams.get('tab');
    if (activeTab) {
        $(`#meta-tabs a[href="#${activeTab}"]`).tab('show');
        document.getElementById(activeTab).scrollIntoView();
    }

});

// ==================================================================

function parseMeta(d, i) {
    /**
    * parse one row of the meta data and set the correct data type
    *
    * @param {Object} d - meta data row
    * @param {integer} i - The row number
    *
    * @return {Object} revised meta data row
    */
    d.Id = i+1;
    d.Longitude = +d.Longitude;
    d.Latitude = +d.Latitude;
    d.Selected = false;
    d.Edited = false;
    if (typeof(d.Temperature) !== 'undefined') {
        if (typeof(d.Temperature.replace) !== 'undefined') {
            d.Temperature = $.map(d.Temperature.replace('[', '').replace(']', '').split(","), v => parseFloat(v));
        };
    }
    if (typeof(d.Precipitation) !== 'undefined') {
        if (typeof(d.Precipitation.replace) !== 'undefined') {
            d.Precipitation = $.map(d.Precipitation.replace('[', '').replace(']', '').split(","), v => parseFloat(v));
        };
    }

    if (typeof(d.ispercent) !== typeof(true)) {
        d.ispercent = d.ispercent.toLowerCase().startsWith('f') ? false : true;
    };

    // Limit latitudes according to latitude map range (-85:85)
    if (d.Latitude < -85) d.Latitude = -85;
    if (d.Latitude > 85) d.Latitude = 85;
    for (var key in d) {
        d[key] = typeof d[key] !== 'undefined' ? d[key] : '';
    }
    return d;
}

// ==================================================================

function displaySampleData(data) {
    displayedId = data.Id;
    displayedData = data;
    highlightDisplayed();

    var activeTab = $('#climate-plot').hasClass("active") ? "climate-plot" : "pollen-plot";
    removeUnlocked();
    document.getElementById("climate-diagram-legend").innerHTML = "<svg/>";
    document.getElementById("pollen-diagram-legend").innerHTML = "<svg/>";

    // plot the climate data
    if (typeof(data.Precipitation) !== 'undefined') {
        var elemId = lockableElement("climate-diagram", data.SampleName, data.SiteName);
        $('#meta-tabs a[href="#climate-plot"]').tab('show');
        plotClimate(data, elemId);
        plotClimateLegend("climate-diagram-legend");
    }

    // load and plot the pollen data
    d3.tsv(
        repo_url + 'samples/' + data.SampleName + '.tsv',
        function(d) {
            d.higher_groupid = groupInfo[d.groupid].higher_groupid;
            d.samplename = data.SampleName;
            d.percentage = d.percentage == '' ? NaN : +d.percentage;
            d.count = d.count == '' ? NaN : +d.count;
            return d
        }).then(function(taxa_data) {

            taxa_data = taxa_data.filter(d => !isNaN(d.percentage))

            var elemId = lockableElement("pollen-diagram", data.SampleName, data.SiteName);
            $('#meta-tabs a[href="#pollen-plot"]').tab('show');
            plotPollen(taxa_data, elemId);
            plotPollenLegend('pollen-diagram-legend');

            $('#meta-tabs a[href="#' + activeTab + '"]').tab('show');

            plottedPollenData[data.SampleName] = taxa_data;
        });

};

// ==================================================================

function getPopupContent(data) {
    /**
    * Get the popup content for one meta data row
    *
    * @param {Object} data - The meta data row
    *
    * @return {string} The popupcontent for the map
    */
    return ('<div class="container" style="width:300px">'
            + `Sample name: <b>${data.SampleName}</b></br>`
            + `<b>${data.Country}</b></br></br>`
            + `Position: <b>${data.Longitude.toFixed(2)} °E</b>, <b>${data.Latitude.toFixed(2)} °N</b> <div class="popuptooltip">(${data.LocationReliability})<span class="tooltiptext">Location reliability</span></div></br>`
            + `Elevation: <b>${data.Elevation}</b> m a.s.l.</br>`
            + `Name: <b>${data.SiteName}</b></br>`
            + (data.SampleType != ""  ? `Sample type: ${data.SampleType} </br>` : "")
            + (data.SampleContext != ""  ? `Sample context: ${data.SampleContext} </br>` : "")
            + (data.AgeBP != ""  ? `Age (BP): ${data.AgeBP} </br>` : "")
            + "</br>"
            + "Workers: " + workerTooltip(data.Worker1_LastName, data.Worker1_FirstName, data.Worker1_Address1, data.Worker1_Address2, data.Worker1_Email1,  data.Worker1_Email2)
            + mailLink(data.SampleName, data.Worker1_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + mailLink(data.SampleName, data.Worker1_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + (data.Worker2_LastName != "" ? "; " + workerTooltip(data.Worker2_LastName, data.Worker2_FirstName, data.Worker2_Address1, data.Worker2_Address2, data.Worker2_Email1,  data.Worker2_Email2) : "")
            + mailLink(data.SampleName, data.Worker2_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + mailLink(data.SampleName, data.Worker2_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + (data.Worker3_LastName != "" ? "; " + workerTooltip(data.Worker3_LastName, data.Worker3_FirstName, data.Worker3_Address1, data.Worker3_Address2, data.Worker3_Email1,  data.Worker3_Email2) : "")
            + mailLink(data.SampleName, data.Worker3_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + mailLink(data.SampleName, data.Worker3_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + (data.Worker4_LastName != "" ? "; " + workerTooltip(data.Worker4_LastName, data.Worker4_FirstName, data.Worker4_Address1, data.Worker4_Address2, data.Worker4_Email1,  data.Worker4_Email2) : "")
            + mailLink(data.SampleName, data.Worker4_Email1, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + mailLink(data.SampleName, data.Worker4_Email2, " <img src='img/mail.png' style='height:1.1em;' alt='mail'>")
            + "</br>"
            + (data.Publication1 != "" ? "<details><summary><b>References...</b></summary><ul><li>" + data.Publication1 + "</li>" : "")
            + (data.Publication2 != "" ? "<li>" + data.Publication2 + "</li>" : "")
            + (data.Publication3 != "" ? "<li>" + data.Publication3 + "</li>" : "")
            + (data.Publication4 != "" ? "<li>" + data.Publication4 + "</li>" : "")
            + (data.Publication5 != "" ? "<li>" + data.Publication5 + "</li>" : "")
            + (data.Publication1 != "" ? "</ul></details>": "")
            + '<input class="btn pull-right" type="image" src="img/error.png" title="Report an issue for this sample" onclick="javascript:reportIssue(displayedData);" style="height:40px;">'
            + '<input class="btn pull-right" type="image" src="img/cartadd.png" title="Add this sample to the download cart" onclick="javascript:displayedData.Selected=true;formattedDataTable.redraw();dataTable.redraw();" style="height:40px;">'
            + '<input class="btn pull-right" type="image" src="img/pencil.png" title="Edit the meta information for this sample" onclick="javascript:editDisplayed();" style="height:40px;">'
            + '</div>');
}

// ==================================================================

function workerTooltip(last, first, address1, address2, email1, email2) {
    // Set up a tooltip for a worker
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

function reportIssue(data) {
    // open the issue tab for the given meta data row
    document.getElementById("issue_title").value = "Error with " + data.SampleName + ': ';
    $('#meta-tabs a[href="#report-issue"]').tab('show');
    document.getElementById('report-issue').scrollIntoView();
}


//====================================================================

function editDisplayed() {
    // edit the displayed data in the JSON editor
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
    formattedDataTable.beginSlice(ofs);
    dataTable.endSlice(ofs+pag);
    formattedDataTable.endSlice(ofs+pag);
}
function display_page_buttons() {
    var totFilteredRecs = xf.groupAll().value();
    var end = ofs + pag > totFilteredRecs ? totFilteredRecs : ofs + pag;
    d3.select('#begin')
        .text(end === 0? ofs : ofs + 1);
    d3.select('#begin-formatted')
        .text(end === 0? ofs : ofs + 1);
    d3.select('#end')
        .text(end);
    d3.select('#end-formatted')
        .text(end);
    d3.select('#prev-table-page')
        .attr('disabled', ofs-pag<0 ? 'true' : null);
    d3.select('#prev-formatted-table-page')
        .attr('disabled', ofs-pag<0 ? 'true' : null);
    d3.select('#next-table-page')
        .attr('disabled', ofs+pag>=totFilteredRecs ? 'true' : null);
    d3.select('#next-formatted-table-page')
        .attr('disabled', ofs+pag>=totFilteredRecs ? 'true' : null);
    d3.select('#size').text(totFilteredRecs);
    d3.select('#size-formatted').text(totFilteredRecs);
    if(totFilteredRecs != xf.size()){
        d3.select('#totalsize').text("(filtered Total: " + xf.size() + " )");
        d3.select('#totalsize-formatted').text("(filtered Total: " + xf.size() + " )");
    }else{
        d3.select('#totalsize').text('');
        d3.select('#totalsize-formatted').text('');
    }
}
function next_table_page() {
    ofs += pag;
    update_offset();
    dataTable.redraw();
    formattedDataTable.redraw();
}
function prev_table_page() {
    ofs -= pag;
    update_offset();
    dataTable.redraw();
    formattedDataTable.redraw();
}

//====================================================================
function initCrossfilter(data) {
    // initialize the crossfilter and setup the dimensions and charts

    //-----------------------------------
    xf = crossfilter(data);

    //-----------------------------------
    sampleNameDim = xf.dimension(function(d) {
        return d.SampleName.split("_").slice(0, -1).join(" ");
    });

    //-----------------------------------
    countryDim = xf.dimension(function(d) {
        return d.Country;
    });

    //-----------------------------------
    sampleContextDim = xf.dimension(function(d) {
        return d.SampleContext ? d.SampleContext : "unspecified";
    });

    //-----------------------------------
    sampleTypeDim = xf.dimension(function(d) {
        return d.SampleType ? d.SampleType : "unspecified";
    });

    //-----------------------------------
    sampleMethodDim = xf.dimension(function(d) {
        return d.SampleMethod ? d.SampleMethod : "unspecified";
    });

    //-----------------------------------
    okexceptDim = xf.dimension(function(d) {
        return d.okexcept ? d.okexcept.split(',').filter(s => s) : ["None"];
    }, true);

    //-----------------------------------
    ageDim = xf.dimension(function(d) {
        return d.AgeUncertainty ? d.AgeUncertainty : "unspecified";
    });

    //-----------------------------------
    locationDim = xf.dimension(function(d) {
        return d.LocationReliability ? d.LocationReliability : "unspecified";
    });

    //-----------------------------------
    workerDim = xf.dimension(function(d) {
        ret = [d.Worker1_LastName + ', ' + d.Worker1_FirstName];
        if (d.Worker2_LastName != "" && typeof d.Worker2_LastName !== 'undefined') ret.push(d.Worker2_LastName + ', ' + d.Worker2_FirstName);
        if (d.Worker3_LastName != "" && typeof d.Worker3_LastName !== 'undefined') ret.push(d.Worker3_LastName + ', ' + d.Worker3_FirstName);
        if (d.Worker4_LastName != "" && typeof d.Worker4_LastName !== 'undefined') ret.push(d.Worker4_LastName + ', ' + d.Worker4_FirstName);
        return ret
    }, true);

    //-----------------------------------
    for (var i = 12; i < monthsSeasons.length; i++) {
        var temperatureDim = xf.dimension( function(d) {
        	// Threshold
        	var temperatureThresholded = d.Temperature[i];
            if (isNaN(temperatureThresholded)) {
                return Infinity;
            }
        	if (temperatureThresholded <= temperatureRange[0]) temperatureThresholded = temperatureRange[0];
        	if (temperatureThresholded >= temperatureRange[1]) temperatureThresholded = temperatureRange[1] - temperatureBinWidth;
        	return temperatureBinWidth*Math.floor(temperatureThresholded/temperatureBinWidth);
        });
        temperatureDims.push(temperatureDim);
        temperatureGroups.push(temperatureDim.group());
    };

    //-----------------------------------
    for (i = 12; i < monthsSeasons.length; i++) {
        var precipDim = xf.dimension( function(d) {
          // Threshold
          var precipThresholded = d.Precipitation[i];
          if (isNaN(precipThresholded)) {
              return Infinity;
          } else if (i < monthsSeasons.length - 1) {
              precipThresholded = precipThresholded > 0 ? precipThresholded / 3. : precipThresholded;
          } else {
              precipThresholded = precipThresholded > 0 ? precipThresholded / 12. : precipThresholded;
          }
          if (precipThresholded <= precipRange[0]) precipThresholded = precipRange[0];
          if (precipThresholded >= precipRange[1]) precipThresholded = precipRange[1] - precipBinWidth;
          return precipBinWidth*Math.floor(precipThresholded/precipBinWidth);
        });
        precipDims.push(precipDim);
        precipGroups.push(precipDim.group());
    };

    //-----------------------------------
    mapDim = xf.dimension(function(d) { return [d.Latitude, d.Longitude, d.Id]; });
    mapGroup = mapDim.group();

    //-----------------------------------
    versionDim = xf.dimension( function(d) {
        return d.EMPD_version ? d.EMPD_version : "None";
    });
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

    mapChart = dc_leaflet.markerChart("#chart-map");

    mapChart
        .width($("#chart-map").width())
        .height(400)
        .dimension(mapDim)
        .group(mapGroup)
        .center(mapCenter)
        .zoom(mapZoom)
        .tiles(function(map) {			// overwrite default baselayer
	   return L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
                { attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community' }).addTo(map);
        })
        .mapOptions({maxZoom: mapMaxZoom, zoomControl: true})
        // .fitOnRender(false)
        .filterByArea(true)
        .cluster(true)
        .clusterOptions({maxClusterRadius: 50, showCoverageOnHover: false, spiderfyOnMaxZoom: true})
        .title(function() {})
        .popup(function(d,marker) {
            Id = d.key[2] -1;
          		popup = L.popup({autoPan: false, closeButton: false, maxWidth: 300});
            popup.setContent(getPopupContent(data[Id]));
                mapMarkers[Id] = marker;

            return popup;
        })
        .marker(function(d,map) {
    	    var Id = d.key[2] -1;
            var icon = L.icon({
                iconSize: iconSize, iconAnchor: iconAnchor,
                popupAnchor: popupAnchor, iconUrl: imgMarker });

            marker = new customMarker([data[Id].Latitude, data[Id].Longitude], {Id: (Id+1).toString(), icon: icon});
            marker.on('mouseover', function(e) {
    			iconUrlNew = imgMarkerHighlight;
    			iconNew = L.icon({ iconSize: iconSize, iconAnchor: iconAnchor, popupAnchor: popupAnchor, iconUrl: iconUrlNew });
    			e.target.setIcon(iconNew);
    			d3.selectAll(".dc-table-column._1")
    				.text(function (d, i) {
			     		if (parseInt(d.Id) == e.target.options.Id) {
                            if ($('#meta-table').hasClass("active")) {
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
            all: `All <strong>%total-count</strong> records selected. Please click on the map or <a href="javascript:showFilters()">here</a> to apply filters.`
        });

    //-----------------------------------
    dataTable = dc.dataTable("#chart-table");

    var  all_columns = Object.keys(data[0]);
    var exclude = ["Selected", "Id", "Edited"];

    var columns = all_columns.filter(s => exclude.indexOf(s) === -1);

    var colFuncs = [
        d => d.Selected ? "<input type='checkbox' checked>" : "<input type='checkbox'>",
        d => d.Id,
    ];

    columns.forEach(function(column) {
          document.getElementById("meta-table-head").innerHTML += (
              '<th class="th_MetaColumn">' + column + '</th>'
          )
          if (column.search("DOI") !== -1) {
              colFuncs.push(function (d) {return DOILink(d[column]);});
          } else if (column.search("Email") !== -1) {
              colFuncs.push(function(d) {return mailLink(d.SampleName, d[column], d[column]);});
          } else {
              colFuncs.push(function(d) {return d[column];});
          };
    });

    dataTable
    .dimension(tableDim)
    .group(function(d) {})
    .showGroups(false)
    .size(Infinity)
    .columns(colFuncs)
    .sortBy(function(d){ return +d.Id; })
    .order(d3.ascending)
    .on('preRender', update_offset)
    .on('preRedraw', update_offset)
    .on('pretransition', display_page_buttons);

    //-----------------------------------
    formattedDataTable = dc.dataTable("#formatted-chart-table");

    formattedDataTable
    .dimension(tableDim)
    .group(function(d) {})
    .showGroups(false)
    .size(Infinity)
    .columns([
        d => d.Selected ? "<input type='checkbox' checked>" : "<input type='checkbox'>",
        d => d.Id,
        d => d.SampleName,
        d => d.SiteName,
        d => d.Country,
        d => d.Elevation,
        function(d) {
            var workers = [];
            for (var i = 1; i < 5; i++) {
                if (d[`Worker${i}_LastName`] !== "") {
                    workers.push(d[`Worker${i}_LastName`] + ', ' +
                                 d[`Worker${i}_FirstName`]);
                }
            }
            return workers.join('; ');
        },
        function(d) {
            var publications = [];
            for (var i = 1; i < 6; i++) {
                if (d['Publication' + i] !== "") {
                    publications.push(d['Publication' + i]);
                }
            }
            return publications.join('; ');
        },
        function (d) {
            var DOIs = [];
            for (var i = 1; i < 6; i++) {
                if (d['DOI' + i] !== "") {
                    DOIs.push(DOILink(d['DOI' + i]));
                }
            }
            return DOIs.join(', ');
        }
    ])
    .sortBy(function(d){ return +d.Id; })
    .order(d3.ascending)
    .on('preRender', update_offset)
    .on('preRedraw', update_offset)
    .on('pretransition', display_page_buttons);

    //-----------------------------------
    var versionColors = d3.scaleOrdinal()
        .domain(["EMPD1", "EMPD2", "None"])
        .range(["#e34a33", Ocean_color, Unkown_color]);   // http://colorbrewer2.org/

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

    countryMenu = dc.selectMenu('#country-filter')
        .dimension(countryDim)
        .group(countryDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------

    sampleContextMenu = dc.selectMenu('#samplecontext-filter')
        .dimension(sampleContextDim)
        .group(sampleContextDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------

    sampleTypeMenu = dc.selectMenu('#sampletype-filter')
        .dimension(sampleTypeDim)
        .group(sampleTypeDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------

    sampleMethodMenu = dc.selectMenu('#samplemethod-filter')
        .dimension(sampleMethodDim)
        .group(sampleMethodDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------
    var ageColors = d3.scaleOrdinal()
        .domain(["A", "B", "C", "unspecified"])
        .range(["#e34a33", Ocean_color, Ferns_color, Unkown_color]);   // http://colorbrewer2.org/

    ageChart  = dc.rowChart("#age-chart");

    ageChart
        .margins({top: 10, right: 10, bottom: 30, left: 10})
        .dimension(ageDim)
        .group(ageDim.group())
        .colors(ageColors)
        .elasticX(true)
        .gap(2)
        .xAxis().ticks(4);

    //-----------------------------------
    var locationColors = d3.scaleOrdinal()
        .domain(["A", "B", "C", "D", "X", "unspecified"])
        .range(["#e34a33", Ocean_color, Ferns_color, Tree_color, Herbs_color, Unkown_color]);   // http://colorbrewer2.org/

    locationChart  = dc.rowChart("#location-chart");

    locationChart
        .margins({top: 10, right: 10, bottom: 30, left: 10})
        .dimension(locationDim)
        .group(locationDim.group())
        .colors(locationColors)
        .elasticX(true)
        .gap(2)
        .xAxis().ticks(4);

    //-----------------------------------

    contributorMenu = dc.selectMenu('#contributor-filter')
        .dimension(sampleNameDim)
        .group(sampleNameDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------
    workerMenu = dc.selectMenu('#worker-filter')
        .dimension(workerDim)
        .group(workerDim.group())
        .multiple(true)
        .numberVisible(10)
        .controlsUseVisibility(true);

    //-----------------------------------
    temperatureChart  = dc.barChart("#chart-temperature");

    temperatureChart
        .width("300")
        .margins({top: 10, right: 20, bottom: 30, left: 40})
        .xAxisLabel("Temperature")
        .yAxisLabel("Entities")
        .centerBar(false)
        .elasticY(true)
        .dimension(temperatureDims[4])
        .group(temperatureGroups[4])
        .x(d3.scaleLinear().domain(temperatureRange))
        .xUnits(dc.units.fp.precision(temperatureBinWidth))
        .round(function(d) {return temperatureBinWidth*Math.floor(d/temperatureBinWidth)})
        .gap(0)
        .renderHorizontalGridLines(true)
        .colors("FireBrick");

    //-----------------------------------
    precipChart  = dc.barChart("#chart-precip");

    precipChart
        .width("300")
        .margins({top: 10, right: 20, bottom: 30, left: 40})
        .xAxisLabel("Precipitation [mm/month]")
        .yAxisLabel("Entities")
        .centerBar(false)
        .elasticY(true)
        .dimension(precipDims[4])
        .group(precipGroups[4])
        .x(d3.scaleLinear().domain(precipRange))
        .xUnits(dc.units.fp.precision(precipBinWidth))
        .round(function(d) {return precipBinWidth*Math.floor(d/precipBinWidth)})
        .gap(0)
        .renderHorizontalGridLines(true)
        .colors(Ocean_color);

    //-----------------------------------
    okexceptMenu = dc.cboxMenu('#okexcept-filter')
        .dimension(okexceptDim)
        .group(okexceptDim.group())
        .multiple(true);

    allCharts = [
        dataTable, formattedDataTable, versionChart, countryMenu,
        sampleContextMenu, sampleTypeMenu, sampleMethodMenu, ageChart,
        locationChart, contributorMenu, workerMenu, temperatureChart,
        precipChart, okexceptMenu];

    //-----------------------------------
    dc.renderAll();
}

// ====================================
// Functions to change the displayed content

function changeTemperatureChart(what) {
    // Change the temperatureChart to a different season
    var temperatureFilters = temperatureChart.filters();
    temperatureChart.filter(null);
    temperatureChart.dimension(temperatureDims[what]);
    temperatureChart.group(temperatureGroups[what]);
    document.getElementById("temperature-title").innerHTML = `Mean ${monthsSeasons[what + 12]} Temperature`;
    temperatureChart.filter([temperatureFilters]);
    dc.redrawAll();
}

function changePrecipChart(what) {
    // Change the precipChart to a different season
    var precipFilters = precipChart.filters();
    precipChart.filter(null);
    precipChart.dimension(precipDims[what]);
    precipChart.group(precipGroups[what]);
    document.getElementById("precip-title").innerHTML = `Mean ${monthsSeasons[what + 12]} Precipitation`;
    precipChart.filter([precipFilters]);
    dc.redrawAll();
}

// ====================================
// Functions to reset the cross filter

function resetData(data) {
    // remove the data and add it again

    xf.remove(function(d, i) {return d.Id === data.Id;});
    xf.add([data]);

    dataTable.sortBy(d => +d.Id);
    formattedDataTable.sortBy(d => +d.Id);

    dc.redrawAll();
}

function showFilters() {
    $('#meta-tabs a[href="#filters-tab"]').tab('show');
    document.getElementById('filters-tab').scrollIntoView();
}

// reset dataTable
function resetTable() {
    dataTable.filterAll();
    dc.redrawAll();
    // make reset link invisible
    d3.select("#resetFormattedTableLink").style("display", "none");
    d3.select("#resetTableLink").style("display", "none");
}

// reset all except mapChart
function resetAll_exceptMap() {
    allCharts.slice(1).forEach(function(chart) {chart.filterAll();});
    resetTable();
    dc.redrawAll();
}

//====================================================================
