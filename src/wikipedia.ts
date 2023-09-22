export class WikipediaQID {
    constructor(public name: string) {}

    async qid(): Promise<string> {
        let promise: Promise<Response> = new Promise((resolve, reject) => {
            fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${this.name}&props=descriptions&languages=en&format=json&origin=*`)
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    reject(error);
                });
        });
        let response = await promise;
        let json = await response.json();
        let qid = Object.keys(json.entities)[0];
        return qid;
    }
}

class SPARQLQueryDispatcher {
	constructor(public endpoint: string) {}

	async query(sparqlQuery: string): Promise<Response> {
		const fullUrl = this.endpoint + '?query=' + encodeURIComponent( sparqlQuery );
		const headers = { 'Accept': 'application/sparql-results+json' };

        return new Promise((resolve, reject) => {
            fetch(fullUrl, {headers})
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    reject(error);
                });
        });
	}
}

export class WikipediaPopDensity {
    constructor(public qid: string) {}

    private endpointUrl = 'https://query.wikidata.org/sparql';
    

    async popDensity(): Promise<number> {
        let sparqlQuery = `SELECT ?density WHERE {
            ?country wdt:P31 wd:Q6256.
            ?country wdt:P17 wd:${this.qid}.
            ?country wdt:P1082 ?population.
        
            OPTIONAL {
                ?country wdt:P2046 ?area.
            }
        
            BIND(?population / ?area AS ?density)
        
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            }
        `;
        let queryDispatcher = new SPARQLQueryDispatcher(this.endpointUrl);
        let response = await queryDispatcher.query(sparqlQuery);
        let json = await response.json();

        console.log(json);

        return json.results.bindings[0].density.value;
    }
}