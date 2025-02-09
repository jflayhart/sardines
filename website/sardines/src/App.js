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

import React, { Component } from 'react';
import SMap from './smap';
import CityList from './citylist';
import Overlay from './overlay';
import Util from './util';

import './App.css';
import './w3.css';
import 'leaflet/dist/leaflet.css';
import 'font-awesome/css/font-awesome.min.css';
import axios from 'axios';
import pako from 'pako';

class App extends Component {
    constructor() {
        super();

        this.worker = null;
        this.geoJson = {
            loaded: false,
            low: {
                areaPerHex: 0.649519052838329,
                geoJson: null
            },
            high: {
                areaPerHex: 0.025980762,
                geoJson: null
            }
        }
        this.state = {
            cities: [
                {name: 'Manila, Philippines', density: 41515},
                {name: 'Mumbai, India', density: 28508},
                {name: 'Paris', density: 21603},
                {name: 'Manhattan', density: 18903},
                {name: 'Cairo', density: 18071},
                {name: 'Barcelona', density: 16000},
                {name: 'Lagos, Nigeria', density: 14469},
                {name: 'Helsinki', density: 7627},
                {name: 'San Francisco', density: 7124},
                {name: 'Tokyo', density: 6225},
                {name: 'Boston', density: 5335},
                {name: 'London', density: 5164},
                {name: 'Munich', density: 4700},
                {name: 'Chicago', density: 4614},
                {name: 'Washington D.C.', density: 4308},
                {name: 'Toronto', density: 4149},
                {name: 'Birmingham, England', density: 4149},
                {name: 'Stockholm', density: 3597},
                {name: 'Amsterdam', density: 3320},
                {name: 'Los Angeles, CA', density: 3272},
                {name: 'Seattle', density: 3242},
                {name: 'Buffalo, NY', density: 2568},
                {name: 'Copenhagen', density: 2052},
                {name: 'St. Louis', density: 1969},
                {name: 'Portland, OR', density: 1689},
                {name: 'Las Vegas', density: 1659},
                {name: 'Dallas, TX', density: 1474},
                {name: 'Kansis City, MO', density: 1474},
                {name: 'Houston, TX', density: 1414},
                {name: 'Oslo', density: 1400},
                {name: 'Columbus, OH', density: 1399},
                {name: 'Champaign, IL', density: 1399},
                {name: 'Atlanta, GA', density: 1345},
                {name: 'Gothenburg, Sweden', density: 1300},
                {name: 'Tampa, FL', density: 1256},
                {name: 'Austin, TX', density: 1208},
                {name: 'Phoenix, AZ', density: 1168},
                {name: 'Charlotte, NC', density: 1050},
                {name: 'Albuquerque, NM', density: 1142},
                {name: 'Orlando, FL', density: 898},
                {name: 'New Orleans, LA', density: 858},
                {name: 'Louisville, KY', density: 743},
                {name: 'Birmingham, AL', density: 655}, /* !mwd - my calculated density */
                {name: 'Little Rock, AR', density: 639},
                {name: 'Nasvhille, TN', density: 512},
                {name: 'Oklahoma City, OK', density: 360},
            ],
            currentCity: null,
            population: {
                city: {
                    population: 212461,
                    density: 655
                },
                metro: {
                    population: 1132000,
                    density: 32
                }
            },
            useMetroPopulation: false,
            features: null,
            loading: false,
        }
    }

    getPopulation() {
        if (this.state.useMetroPopulation) {
            return this.state.population.metro;
        } else {
            return this.state.population.city;
        }
    }

    handlePopulationChanged(useMetroPopulation) {
        this.setState({
            useMetroPopulation: useMetroPopulation,
            currentCity: null,
            features: null
        });
    }

    handleCityClick(city) {
        console.log('handleCityClick ' + city);
        console.log("city was clicked " + city.name + " " + city.density);
        console.log("using birmingham population: " + this.getPopulation().population);

        this.setState({
            loading: true
        });

        let population = this.getPopulation().population;

        if (this.geoJson.loaded) {
            console.log('already have geojson');
            this.doBuild(city, this.geoJson, population, city.density);
        } else {
            axios.all([this.fetchHexGrid('/birmingham-hexgrid-with-priorities.geojson.gz'),
                       this.fetchHexGrid('/birmingham-hexgrid-with-priorities-0.5km.geojson.gz')])
                .then(axios.spread((highRes, lowRes) => {

                    this.geoJson.high.geoJson = highRes;
                    this.geoJson.low.geoJson = lowRes;
                    this.geoJson.loaded = true;

                    this.doBuild(city, this.geoJson, population, city.density);
                }));
        }
    }

    fetchHexGrid(name) {
        console.log('fetching geojson: ' + name);
        // fetch first the high res
        return axios.get(name, {
            responseType: 'arraybuffer'
        }).then((response) => {
            // decompress
            return JSON.parse(pako.ungzip(response.data, {to: 'string'}));
        });
    }

    doBuild(city, geojson, population) {
        // if we don't have a webworker, create one
        if (this.worker != null) {
            console.log('terminating old worker');
            this.worker.terminate();
            this.worker = null;
        }
        this.worker = new Worker("./builder.js");

        this.worker.onmessage = (e) =>  {
            console.log('received results for ' + e.data.city.name);
            this.setState({
                currentCity: e.data.city,
                features: e.data.results,
                loading: false,
            });

            this.worker.terminate();
        };

        // send a message to the worker, asking
        //  them to build the new city
        this.worker.postMessage({city: city,
                                 geojson: geojson,
                                 population: population,
                                 density: city.density});

    }

    render() {
        let population = this.getPopulation();

        let currentCity = null;
        if (this.state.currentCity != null) {
            currentCity = this.state.currentCity.name;
        }

        return (
            <div className="App">
                {/* NavBar */}
                <CityList cities={this.state.cities}
                          current={currentCity}
                          useMetroPopulation={this.state.useMetroPopulation}
                          birminghamPopulation={population}
                          onCityChanged={(useMetro) => this.handlePopulationChanged(useMetro)}
                    onClick={(city) => this.handleCityClick(city)}
                    />

                    {/* Main Content with Header */}
                    <div className="w3-main sardine-main">
                        {/* Push content down on small screens */}
                        <div className="w3-hide-large sardine-header-margin">
                        </div>

                        <div className="w3-hide-medium w3-hide-small sardine-header">
                            <h1 className="sardine-h1">If Birmingham Were As Dense As {currentCity || '...'}</h1>
                            {currentCity && <h3 className="sardine-h3">then all {Util.addCommas(population.population)} residents would have to live in this block</h3>}
                        </div>

                        <div className="w3-container">
                            <SMap features={this.state.features} city={currentCity} useMetroPopulation={this.state.useMetroPopulation} />
                            <Overlay visible={this.state.loading} />
                        </div>
                    </div>
            </div>
        );
    }
}

export default App;
