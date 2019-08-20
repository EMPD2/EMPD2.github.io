import { Selector } from 'testcafe';
import { ClientFunction } from 'testcafe';

const getAllCharts = ClientFunction(() => allCharts);

const plotTestData = ClientFunction(() => displaySampleData({
    "SampleName": "test_a1",
    "OriginalSampleName": "orig_test_a1",
    "SiteName": "somewhere",
    "Country": "France",
    "Longitude": 10,
    "Latitude": 50,
    "Elevation": "340",
    "Temperature": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    "Precipitation": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    "LocationReliability": "X",
    "LocationNotes": "Actually in Germany",
    "AreaOfSite": "30",
    "ispercent": true,
    "okexcept": "",
    "Id": 1,
    "Selected": false,
    "Edited": false
}));

const getPlottedPollenData = ClientFunction(() => plottedPollenData);

const getClimateDiagram = ClientFunction(() => document.getElementById("climate-diagram-test_a1").innerHTML);

fixture `Page build`
    .page `../index.html?branch=test-data&meta=test.tsv`;

test('Test plotting of the data', async t => {
    // test for the allCharts getting populated, i.e. until initCrossfilter if
    // finished

    await t.expect(getAllCharts()).ok();

    const plotted = await plotTestData();

    await t.expect(getPlottedPollenData()).ok();

    await t.expect(getClimateDiagram()).ok();

});
