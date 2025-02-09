/* -*- Mode: rjsx -*- */

/*******************************************
 * Copyright (2017)
 *  Marcus Dillavou <line72@line72.net>
 *  http://line72.net
 *
 * Sardines:
 *  https://github.com/line72/sardines
 *  https://sardines.line72.net
 *
 * Licensed Under the GPLv3
 *******************************************/

class Builder {
    constructor() {
        this.mapCentroid = [-86.806379, 33.513501];
    }

    build(geojson, population, density) {
        /* In our hex grid, each hex has
         * a radius (and side length) of
         * 0.1km. Using the area equation
         * of a regular hex:
         *
         * A = (3*√3*s^2) / 2
         *
         * We calculate the area of each
         * hex to be 0.025980762km^2
         */

        const [desired, features] = this.findDesiredFeatures(geojson, population, density);

        let count = 0;

        features.sort((a, b) => {
            if (a.properties.priority == null) {
                return 1;
            } else if (b.properties.priority == null) {
                return -1;
            } else if (a.properties.priority == b.properties.priority) {
                // prioritize by the one closest to the center
                let distanceA = this.findDistanceToCenter([a.properties.centroidLongitude, a.properties.centroidLatitude]);
                let distanceB = this.findDistanceToCenter([b.properties.centroidLongitude, b.properties.centroidLatitude]);
                return distanceA - distanceB;
            } else {
                return a.properties.priority - b.properties.priority;
            }
        });

        let results = [];
        for (let key in features) {
            var feature = features[key];
            //console.log("feature = " + feature);
            //if (count < desired && feature.properties.priority == 1) {
            if (count < desired) {
                count += 1;

                results.push(feature);
            }
        }

        console.log('count=' + count + ' desired=' + desired);

        // now just find a boundary to create a single
        //  representation

        // create a list of all the points and their count
        let pointToFeatures = {};
        for (let i in results) {
            let result = results[i];
            for (let j in result["geometry"]["coordinates"][0]) {
                let coord = this.roundKey(result["geometry"]["coordinates"][0][j]);
                if (coord in pointToFeatures) {
                    if (pointToFeatures[coord].indexOf(result) === -1) {
                        pointToFeatures[coord].push(result);
                    }
                } else {
                    pointToFeatures[coord] = [result];
                }
            }
        }

        // filter out any results that
        //  don't have any edges
        let filteredResults = results.filter((r) => {
            for (let i in r["geometry"]["coordinates"][0]) {
                let c = r["geometry"]["coordinates"][0][i];
                let key = this.roundKey(c);

                if (pointToFeatures[key].length <= 2) {
                    // found an edge
                    return true;
                }
            }
            return false;
        });

        console.log('all results = ' + results.length);
        console.log('filtered results = ' + filteredResults.length);

        let boundaries = []
        // now walk the filtered results, to find a boundary
        while (filteredResults.length > 0) {
            let boundary = []
            let startingKey = null;

            let toVisit = []

            // remove this item from filteredResults
            let r = filteredResults[0];

            toVisit.push([r, 0]);

            while (toVisit.length > 0) {
                // pop this off
                let [n, startingIndex] = toVisit.pop();

                // remove from our filteredResults
                let index = filteredResults.indexOf(n);
                if (index !== -1) {
                    filteredResults.splice(index, 1);
                }

                let found = false;
                // start at the starting index, and loop through
                //  the coordinates. The 7th coordinate (index 6) is always
                //  a duplicate of the 1st coordinate (index 0), so we skip
                //  it, and drop back to the beginning.
                // we need to decide if we want to go counter-clockwise, or
                //  clockwise. Try counter, if the starting point isn't a boundary
                //  then try clockwise
                let k = this.roundKey(n["geometry"]["coordinates"][0][startingIndex % 6])

                let start = 0;
                let end = 0;
                let inc = 1;

                if (pointToFeatures[k].length <= 2) { // counter
                    start = startingIndex;
                    end = start + 6;
                    inc = 1;
                } else { // clockwise
                    console.log('going clockwise!!');
                    start = startingIndex - 2;
                    end = start - 6;
                    inc = -1;
                }

                for (let i = start; i < end; i += inc) {
                    let c = n["geometry"]["coordinates"][0][i % 6];
                    let key = this.roundKey(c);

                    if (key === startingKey) {
                        break;
                    }

                    if (pointToFeatures[key].length === 1) {
                        found = true;

                        if (boundary.length === 0) {
                            startingKey = key;
                        }

                        boundary.push(c);
                    } else if (pointToFeatures[key].length === 2) {
                        found = true;

                        if (boundary.length === 0) {
                            startingKey = key;
                        }

                        boundary.push(c);
                        // find the other polygon to visit
                        let o = this.getOtherAndOffset(pointToFeatures[key], n, key);
                        if (o != null) {
                            toVisit.push(o);
                        } else {
                            console.log('ERROR: unable to find other');
                        }

                        // end our loop and go to the next polygon
                        break;
                    } else if (found) {
                        // we are all done?
                        break;
                    } else {
                        // we started off on an internal
                        //  node. Keep going through our
                        //  coordinates until we find a
                        //  boundary point.
                    }
                }
            }
            boundaries.push(boundary);
        }

        console.log('found boundaries=' + boundaries.length);
        console.log('filteredResults=' + filteredResults.length);

        // generate the GeoJSON geometry based on the boundaries
        let geoJSON = this.buildGeoJSON(boundaries);
        console.log('geoJSON=' + geoJSON.length);

        return geoJSON;
    }

    /**
     * Generate a string key
     * rounding the numbers a little
     */
    roundKey(point) {
        return point[0].toFixed(11) + 'x' + point[1].toFixed(11);
    }

    /**
     * calculate the distance between the polygon
     * centroid and our map centroid
     */
    findDistanceToCenter(centroid) {
        return Math.sqrt(Math.pow(centroid[0] - this.mapCentroid[0], 2) +
                         Math.pow(centroid[1] - this.mapCentroid[1], 2));
    }

    /**
     * Get the other polygon and
     *  find the index of the matching
     *  coordinate
     */
    getOtherAndOffset(items, n, key) {
        let match = items.find((i) => i !== n);
        if (match) {
            for (let i in match["geometry"]["coordinates"][0]) {
                let c = match["geometry"]["coordinates"][0][i];
                let k = this.roundKey(c);

                if (k === key) {
                    return [match, ++i];
                }
            }
        }
        return null;
    }

    findDesiredFeatures(geojson, population, density) {
        // decide if we should use the high res or low-res
        //  version

        // first try high res
        let areaPerHex = geojson.high.areaPerHex;
        let peoplePerHex = 1.0 / areaPerHex;
        let densityPerHex = density / peoplePerHex;
        let desired = population / densityPerHex;

        // if we want less than the available features,
        //  then use this version
        if (desired < geojson.high.geoJson.features.length) {
            return [desired, geojson.high.geoJson.features];
        }

        // fallback to low-res
        console.log('falling back to low res');
        areaPerHex = geojson.low.areaPerHex;
        peoplePerHex = 1.0 / areaPerHex;
        densityPerHex = density / peoplePerHex;
        desired = population / densityPerHex;

        return [desired, geojson.low.geoJson.features];
    }

    buildGeoJSON(boundaries) {
        return boundaries.filter((boundary) => {
            // needs to be at least 2 hexes big
            return boundary.length > 10
        }).map((boundary) => {
            return {type: "Feature",
                    properties: {
                        priority: 0
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [boundary]
                    }
                   };
        });
    }
}

onmessage = function(e) {
    console.log('building results for ' + e.data.city.name);
    let builder = new Builder();
    let results = builder.build(e.data.geojson, e.data.population, e.data.density);

    console.log('finished results for ' + e.data.city.name);
    postMessage({city: e.data.city,
                 results: results});
}
