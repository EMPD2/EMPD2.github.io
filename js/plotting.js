// Plotting functions

var groupInfo = {};  // populated by setup.js

var Ocean_color = "#81a6d3";
var Ferns_color = "#afa393";
var Tree_color = "#568e14";
var Trees_color = Tree_color;
var Herbs_color = "#ff7f50";
var Unkown_color = "#FF4400";

var groupColors = {
"TRSH": Trees_color,
"HERB": Herbs_color,
"VACR": Ferns_color,
"AQUA": Ocean_color
}

var groupNames = {
"TRSH": "Trees & Shrubs",
"PALM": "Palms",
"MANG": "Mangroves",
"LIAN": "Lianas",
"SUCC": "Succulents",
"HERB": "Herbs",
"VACR": "Ferns",
"AQUA": "Aquatics"
}

//====================================================================

function plotPollen(data, elemId, groupByName="acc_varname") {
	/**
	* Plot the pollen percentages of one single sample as a bar diagram.
    *
	* This function takes pollen data, one taxon per element in `data`, and
	* displays it as individual vertical bars. Each element in data must look
	* like
	*
	* ```javascript
	* {
	*     percentage: The percentage of the taxon,
	*     count: The pollen count,
	*     higher_groupid: The group id as defined in the `groupNames` variable,
	*     acc_varname: The accepted variable name,
	*     original_varname: The original variable name as used by the other,
	*     consol_name: The consolidated name (optional),
	* }
	* ```
    *
	* The x-labels of the bars (i.e. the taxa names) are determined by the
	* `groupByName` variable. It must point to one of the properties in the
	* `data` (acc_varname, original_varname, or consol_name) that shall be used
	* for the x-axis. Potential duplicates are summed up.
	*
	* @see plotPollenLegend
    *
	* @param {Array.<Object>} data - The array of taxon percentages
	* @param  {string} elemId - The id where to plot the diagram
	* @param {string} groupByName - The property to use for the x-axis
	*/

    // make the plots
    var plotGroups = ["TRSH", "PALM", "MANG", "LIAN", "SUCC", "HERB", "VACR", "AQUA"];

    data.filter(d => !plotGroups.includes(d.higher_groupid)).forEach(
        function(d) {
            plotGroups.push(d.higher_groupid);
        }
    );

    var groupMap = {};
    plotGroups.forEach(function(key) {
        groupMap[key] = [];
    });

    var counts = {};

    data.forEach(function(d) {
        var name = d[groupByName] ? d[groupByName] : (
            d.consol_name ? d.consol_name : (
                d.acc_varname ? d.acc_varname : d.original_varname));
        d.name = name;
        if (!(name in counts)) {
            counts[name] = {
                percentage: 0,
                name: name, count: 0,
                orig: [], recon: [], acc: [], consol: [], group: []};
            groupMap[d.higher_groupid].push(name);
        }
        counts[name].percentage += d.percentage;
        counts[name].count += d.count;
        if (!(counts[name].orig.includes(d.original_varname))) {
            counts[name].orig.push(d.original_varname);
        }
        if (!(counts[name].recon.includes(d.reconname))) {
            counts[name].recon.push(d.reconname);
        }
        if (!(counts[name].consol.includes(d.consol_name))) {
            counts[name].consol.push(d.consol_name);
        }
        if (!(counts[name].acc.includes(d.acc_varname))) {
            counts[name].acc.push(d.acc_varname);
        }
        if (!(counts[name].group.includes(d.higher_groupid))) {
            counts[name].group.push(d.higher_groupid);
        }

    })

    Object.values(groupMap).forEach(function(a) {
        a.sort((a, b) => counts[a].name < counts[b].name ? -1 : 1);
    });

    var plotData = [];
    plotGroups.forEach(function(g) {
        groupMap[g].forEach(function(name) {
            var d = jsonCopy(counts[name]);
            d.group = g;
            plotData.push(d);
        });
    });

    var svg = d3.select("#" + elemId).append("svg"),
        margin = {top: 60, right: 80, bottom: 180, left: 40},
        width = $("#" + elemId).width() - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    svg
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", "0 0 960 240")

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        meta = counts[d.name];
        return `<strong>${d.name}</strong><br><br>` +
               "<table class='tooltip-table'>" +
               `<tr><td>Original name(s):</td><td>${d.orig.join(', ')}</td></tr>` +
               `<tr><td>Accepted name(s):</td><td>${d.acc.join(', ')}</td></tr>` +
               `<tr><td>Consolidated name(s):</td><td>${d.consol.join(', ')}</td></tr>` +
               `<tr><td>Group: </td><td>${meta.group.join(', ')}</td></tr>` +
               `<tr><td>Percentage: </td><td>${(+d.percentage).toFixed(2)}%</td></tr>` +
               `<tr><td>Counts: </td><td>${d.count}</td></tr>` +
               `</table>`;
    });

    svg.call(tip);

    var nbars = plotData.length;
    var barWidth = width / nbars;
    var barPadding = 4;

    var x = d3.scaleOrdinal().range(Array.from(Array(nbars).keys()).map(function(d) {return (d+1) * barWidth;}));
    var y = d3.scaleLinear().rangeRound([height, 0]);

    var g = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var maxPollen = Math.max.apply(Math, plotData.map(d => +d.percentage));

    // to handle duplicated taxa names, we add the `index` to the name. This
    // will be removed later
    x.domain(plotData.map((d, i) => formatNumberLength(i, 2) + d.name));
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
      .data(plotData)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(+d.percentage))
        .attr("width", barWidth - barPadding)
        .attr("height", d => height - y(+d.percentage))
        .style("fill", d => groupColors[d.group] || Unkown_color)
        .attr("transform", (d, i) => `translate(${barWidth * (i + 0.5) + barPadding / 2} , 0)`)
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);

    // Exaggerations
    g.append("g")
      .selectAll(".bar")
      .data(plotData)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => y(+d.percentage * 5 < maxPollen ? +d.percentage*5 : 0))
        .attr("width", barWidth - barPadding)
        .attr("height", d => height - y(+d.percentage * 5 < maxPollen ? +d.percentage*5 : 0))
        .style("stroke", d => groupColors[d.group] || Unkown_color)
        .style("stroke-dasharray", ("10,3")) // make the stroke dashed
        .style("fill", "none")
        .attr("transform", (d, i) => `translate(${barWidth * (i + 0.5) + barPadding / 2} , 0)`);

    var groups = plotGroups
        .map(g => ( {"key": g, "count": groupMap[g].length} ))
        .filter(d => d.count);

    // groupname bars
    g.append("g")
      .selectAll(".bar")
      .data(groups)
      .enter().append("rect")
        .attr("class", "bar")
        .attr("y", d => -margin.top+30)
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

//====================================================================

function plotPollenLegend(elemId) {
	/**
	* Plot the legend for the pollen diagram
    *
	* @see plotPollen
	*
	* @param  {string} elemId - The id where to plot the diagram
	*/
    var svg = d3.select("#" + elemId).select("svg");

    legendPadding = 10;

    var g = svg.append("g").attr("class", "legend")
            .style("font-size", "18px")
            .attr("transform", "translate(25, 40)");

    var groups = ["TRSH", "HERB", "VACR", "AQUA",
                  "5-times exaggerated"];
    groups.forEach(function(text, i) {
        g.append("text")
            .attr("y", i+"em")
            .attr("x", "1em")
    	    .text(groupNames[text] || text);
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

// ==================================================================

function plotClimate(data, elemId) {
	/**
	* Plot the monthly and seasonal climate for a sample
    *
	* This function plots the monthly, seasonal and annual tmperature and
	* precipitation of the samples. The given `data` must hold a
	* `Precipitation` and `Temperature` property that is used for the
	* plotting.
	*
	* @see plotClimateLegend
    *
	* @param {Object} data - The meta data with a Precipitation and Temperature property
	* @param  {string} elemId - The id where to plot the diagram
	*/

    var precip = data.Precipitation.slice(),
        temperature = data.Temperature;

    for (i = 12; i < monthsSeasons.length; i++) {
        if (isNaN(precip[i])) {
            // do nothing
        } else if (i < monthsSeasons.length - 1) {
            precip[i] = precip[i] > 0 ? precip[i] / 3. : precip[i]
        } else {
            precip[i] = precip[i] > 0 ? precip[i] / 12. : precip[i]
        }
    }

    var svg = d3.select("#" + elemId).append("svg"),
        margin = {top: 40, right: 80, bottom: 180, left: 40},
        width = $("#" + elemId).width() - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    svg
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", "0 0 960 240")

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html((d, i) => "<table class='tooltip-table'>" +
                      `<tr><td>Precipitation:</td><td>${Math.round(precip[i]*100)/100} mm/month</td></tr>` +
                      `<tr><td>Temperature:</td><td>${Math.round(temperature[i]*100)/100} ºC</td></tr>` +
                      `</table>`
                  );

    svg.call(tip);

    var nbars = precip.length;
    var barWidth = width / nbars;
    var barPadding = 4;

    var x = d3.scaleOrdinal().range(Array.from(Array(nbars).keys()).map(function(d) {return d * barWidth;})),
        y = d3.scaleLinear().rangeRound([height, 0]),
        y2 = d3.scaleLinear().rangeRound([height, 0]);

    var g = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var title = g.append("text")
        .attr("dx", (width / 2))
        .attr("y", -margin.top+20)
        .attr("text-anchor", "middle")
        .attr("class", "title")
        .text(title);

    var maxTemp = Math.max.apply(Math, temperature);
    var minTemp = Math.min.apply(Math, temperature);
    var maxPrecip = Math.max.apply(Math, precip);

    x.domain(monthsSeasons);
    y.domain([minTemp, maxTemp]);
    y2.domain([0, maxPrecip])

    var temperatureLine = d3.line()
        .x(function(d, i) {return x(i) + barWidth / 2})
        .y(function(d, i) {return y(d)})

    var xAxis = g => g
        .attr("class", "axis axis--x")
        .attr("transform", "translate(" + (barWidth / 2) +  "," + height + ")")
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .selectAll("text")
            .style("text-anchor", "middle");

    var yAxis = g => g
        .attr("class", "axis axis--y")
        // .attr("transform", "translate(0" + width + " ,0)")
        .call(d3.axisLeft(y).ticks(5))
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("x", -40)
        .attr("text-anchor", "middle")
        .text("Temperature [ºC]");

    var yAxis2 = g => g
        .attr("class", "axis axis--y")
        .attr("transform", "translate(" + width + " ,0)")
        .call(d3.axisRight(y2).ticks(5))
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 40)
        .attr("x", -30)
        .attr("text-anchor", "middle")
        .text("Precipitation [mm/month]");

    g.append("g").call(xAxis);
    g.append("g").call(yAxis);
    g.append("g").call(yAxis2);

    g.selectAll(".bar")
      .data(precip)
      .enter().append("rect")
        .attr("class", "bar")
        // .attr("x", function(d) { return x(d); })
        .attr("y", d => y2(d))
        .attr("width", barWidth - barPadding)
        .attr("height", d => height - y2(d))
        .style("fill", "steelblue")
        .attr("transform", function (d, i) {
             var translate = [barWidth * i + barPadding / 2 , 0];
             return "translate("+ translate +")";})
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);

    g.append("path")        // Add the temperature path.
        .style("stroke", "FireBrick")
        .style("fill", "none")
        .attr('stroke-width', 2)
        .attr("d", temperatureLine(temperature))
        .attr("transform", function (d, i) {
             var translate = [barWidth * i + barPadding , 0];
             return "translate("+ translate +")";
        });

    // vertical line to separate months and seasons
    g.append("line")
        .attr("x1", x(12))
        .attr("y1", 0)
        .attr("x2", x(12))
        .attr("y2", 300 - margin.top - margin.bottom)
        .style("stroke-dasharray", ("3, 3"))
        .style("stroke-width", 2)
        .style("stroke", "black")
        .style("fill", "none");

}

//====================================================================

function plotClimateLegend(elemId) {
	/**
	* Plot the climate legend
	*
	* @see plotClimate
    *
	* @param  {string} elemId - The id where to plot the legend
	*/
    var svg = d3.select("#" + elemId).select("svg");

    legendPadding = 10;

    var g = svg.append("g").attr("class", "legend")
            .style("font-size", "18px")
            .attr("transform", "translate(25, 40)");

    g.append("text")
        .attr("y", 0)
        .attr("x", "1em")
        .text("Precipitation");
    g.append("circle")
        .attr("cy", -0.25+"em")
        .attr("cx", 0)
        .attr("r", "0.4em")
        .style("fill", "steelblue");

    g.append("text")
        .attr("y", "1em")
        .attr("x", "1em")
        .text("Temperature");
    g.append("line")
        .attr("x1", 0)
        .attr("x2", "1em")
        .attr("y1", "0.75em")
        .attr("y2", "0.75em")
        .style("stroke", "FireBrick")
        .attr('stroke-width', 2);

    var lbbox = g.node().getBBox();
    g.append("rect")
        .attr("x",(lbbox.x-legendPadding))
        .attr("y",(lbbox.y-legendPadding))
        .attr("height",(lbbox.height+2*legendPadding))
        .attr("width",(lbbox.width+2*legendPadding))
        .style("fill", "none")
        .style("stroke", "black");
}
