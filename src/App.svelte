<script lang="ts">
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from '/vite.svg'
  import { WikipediaQID, WikipediaPopDensity } from './wikipedia'
  import Katex from "./katex.svelte"

  type Position = {latitude: number, longitude: number}

  /// A Future is a value that will be set in the future.
  /// Inspired by the Twitter Promise implementation:
  /// https://twitter.github.io/util/docs/com/twitter/util/Promise.html
  /// We expose a promise that will be resolved or rejected, thus
  /// allowing the user to use the Future with async/await.
  /// [This is surprisingly an inmutable object]
  class Future<T> {
    promise: Promise<T>
    // Typescript is freaking out because it thinks that resolve and reject
    // are not being defined in the constructor. This is actually good
    // behavior. As the promise contructor requires a lambda, we can't
    // be sure that resolve and reject will be defined before the Future
    // constructor is called. We assume that this process will be quick
    // enough to not cause any problems, but it does makes this
    // implementation a bit unsafe.
    private resolve: (value: T) => void = () => {}
    private reject: (error: Error) => void = () => {}

    // TODO: Add a semaphore to prevent the user from setting the value
    // before resolve and reject are defined?
    constructor() {
      let that = this // I'm not entirely sure if this is necessary, but
      // my intuition tells me that `this` in the Promise's lambda
      // is going to be a `this` to that context, not to the Future one.
      // Dunno, I don't usually use Javascript, but we'll take the
      // safe route here.
      this.promise = new Promise((resolve, reject) => {
        that.resolve = resolve
        that.reject = reject
      })
      // At this point, we just ASSUME that resolve and reject are defined.
    }

    static value<T>(value: T): Future<T> {
      let future: Future<T> = new Future<T>()
      future.setValue(value)
      return future
    }

    setValue(value: T) {
      this.resolve(value)
    }

    setError(error: Error) {
      this.reject(error)
    }

    flatMap<U>(f: (value: T) => Future<U>): Future<U> {
      let future: Future<U> = new Future<U>()
      this.promise.then((value) => {
        let newFuture: Future<U> = f(value)
        newFuture.promise.then((value) => {
          future.setValue(value)
        }).catch((error) => {
          future.setError(error)
        })
      }).catch((error) => {
        future.setError(error)
      })
      return future
    }
  }

  var isLocationAllowed: boolean = false

  // These values are going to be set when the user allows the location
  // to be used. And Futures are inmutable, so `let` is good enough c:
  let positionFuture: Future<Position> = new Future<Position>()
  let countryFuture: Future<string> = new Future<string>()
  let popDensityFuture: Future<number> = new Future<number>()
  let doneFuture: Future<number> = positionFuture.flatMap((_) => {
    return countryFuture.flatMap((_) => {
      return popDensityFuture.flatMap((density) => {
        return Future.value(density)
      })
    })
  })

  async function getGeolocation(): Promise<Position> {
    let promise: Promise<GeolocationPosition> = new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((position) => {
        resolve(position)
      }, (error) => {
        reject(error)
      })
    })
    let position: GeolocationPosition = await promise
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    }
  }

  async function getCountry(params: Position): Promise<string> {
    let promise: Promise<Response> = new Promise((resolve, reject) => {
      fetch(`https://geocode.maps.co/reverse?lat=${params.latitude}&lon=${params.longitude}`)
        .then((response) => {
          resolve(response)
        }).catch((error) => {
          reject(error)
        })
    })
    let response: Response = await promise
    let json = await response.json()
    let name: string = json.address.country
    return name
  }

  async function calculateDensity(): Promise<number> {
    let position = await getGeolocation()
    positionFuture.setValue(position)
    let country: string = await getCountry(position)
    countryFuture.setValue(country)
    let qid: string = await new WikipediaQID(country).qid()
    let popDensity: number = await new WikipediaPopDensity(qid).popDensity()
    popDensityFuture.setValue(popDensity)
    return popDensity
  }

  async function run() {
    isLocationAllowed = true
    await calculateDensity()
  }

  let formula = "r = \\sqrt{\\frac{17520}{\\pi P_d X_f X_d}}"
  let formula2 = (value: number) => `P_d = ${value} \\frac{\\text{people}}{km^2}`
  let formula3 = (pd: number, xf: number, xd: number) => `r = \\sqrt{\\frac{17520}{\\pi \\cdot ${pd} \\cdot ${xf} \\cdot ${xd}}}`
</script>

<main>
  
  <h1>
    Is someone having sex near your location in your city?
  </h1>
  <h2>
    Find out now! (Actually, that's a weird question. Why would you want to know that?
    But this is just stadistics 😵‍💫, so don't worry; math got your back!)
  </h2>
  <h3>
    <a href="https://xkcd.com/563/" target="_blank" rel="noreferrer">Based on this XKCD comic</a>
  </h3>

  <div class="runner">
    {#if !isLocationAllowed}
    <span>
      First, we need to know your location, so click on the button below to allow us to know where you are.
    </span>
    <span>
    <button on:click={run}>
      Allow location
    </button>
    </span>
    {:else}
      {#await positionFuture.promise then value }
        <p>
        Your location is {value.latitude}, {value.longitude}
        </p>
      {/await}
      {#await countryFuture.promise then value }
        <p>
        So some API that we are calling says that you are in {value}!
        </p>
      {/await}
      {#await popDensityFuture.promise then value }
        <p>
        And we asked Wikipedia for the population details of that country.
        With a SPARQL query, we found that the population density is {value} people per square kilometer!
        </p>
      {/await}
      {#await doneFuture.promise then value }
        <p>
          The following formula will be employed for our analysis:
        </p>
        <p>
          <Katex math={formula} />
        </p>
        
        <p>
          In this formula:
          <ul>
            <li>
              <Katex math="r" /> represents the typical proximity radius within which a minimum of two
              individuals engage in sexual activity within a specified vicinity (measured in kilometers).
            </li>
            <li>
              <Katex math="P_d" /> denotes the population density of the respective country (in
              individuals per square kilometer). This factor reflects how densely populated an area is
              with potential sexual partners.
            </li>
            <li>
              <Katex math="X_f" /> stands for the average frequency of sexual activity per person annually
              (normalized to hours per year in the formula). It illustrates how often people engage in
              sexual activity.
            </li>
            <li>
              <Katex math="X_d" /> represents the average duration of sexual activity per person during a
              single occasion (measured in hours per occasion). This factor accounts for how long sexual
              activities typically last.
            </li>
          </ul>
        <p>
          It is crucial to emphasize the presence of the constant 17520 within the formula. This value
          derives from the total number of hours in a year (8760) multiplied by 2. The "2" in this
          constant signifies the requirement that, for a given radius "r," there must be a minimum of
          two individuals engaging in sexual activity within that area. This requirement results from
          the interplay between the average frequency of sexual activity, the average duration of sexual
          activity, and the population density within the area.
        </p>
        <p>
          In practical terms, this formula helps estimate the proximity within which one is likely to find
          at least two individuals engaging in sexual activity based on factors such as population density,
          the frequency of sexual activity, and the duration of each encounter. It can be a valuable tool
          for various studies and research related to human behavior and demographics.
        </p>
        <p>
          Currently we have the following assumption: <Katex math={formula2(value)} />.
        </p>
        <p>
          In an erudite exposé authored by Jean M. Twenge, Ryne A. Sherman, and Brooke E. Wells in the year
          2017, bearing the title "Declines in Sexual Frequency among American Adults, 1989-2014," and
          published on pages three under the auspices of the periodical with the identifier
          10.1007/s10508-017-0953-1, it was unearthed that the frequency of sexual encounters among adult
          denizens of the United States witnessed a noticeable diminution over the specified time frame.
          Specifically, this scholarly inquiry revealed that as recently as the year 2002, the typical adult
          American engaged in sexual activity approximately 64 times within the span of a year. However, by
          the culmination of the year 2014, this rate exhibited a perceptible decline, dwindling to an
          approximate annual occurrence of 53 instances.
        </p>
        <p>
          Consequently, one may, in a well-informed conjecture, posit that the mean frequency of sexual
          engagements for individuals, derived by summing these recorded values and dividing by two to
          arrive at a central tendency, hovers at an estimated 58.5 instances per annum. It is incumbent
          upon us to acknowledge a certain inherent bias within this estimation, as it predominantly
          pertains to the American populace.
        </p>
        <p>
          Acknowledging this information, we can now proceed to ascertain that <Katex math="X_f = 58.5" />.
        </p>
        <p>
          In an article penned by Marcel D. Waldinger, Paul Quinn, Maria Dilleen, Rajiv Mundayat, Dave H.
          Schweitzer, and Mitradev Boolell, and cited as "A multinational population survey of intravaginal
          ejaculation latency time," and published under the identifiers PMID: 16422843 and DOI:
          10.1111/j.1743-6109.2005.00070.x, a comprehensive investigation was undertaken to scrutinize
          the distribution of intravaginal ejaculation latency time (IELT) across a diverse spectrum of
          five distinct nations. The empirical analysis of this extensive multinational dataset revealed a
          discernible, positively skewed distribution pattern of IELT values, prominently characterized by
          a median IELT duration of 5.4 minutes. It is incumbent upon the scholar to note that the IELT
          durations spanned a range from a minimum of 0.55 minutes to a maximum of 44.1 minutes within
          the confines of this study cohort.
        </p>
        <p>
          Consequently, one may, with the utmost circumspection and meticulousness, articulate that the
          calculated average duration of sexual intercourse, when expressed in terms of hours, precisely
          equates to 0.09 hours, as deduced from the conversion of the aforementioned median IELT value,
          originally measured in minutes.
        </p>
        <p>
          Thus, we can now proceed to ascertain that <Katex math="X_d = 0.09" />.
        </p>
        <p>
          So, with some level of substitution, we can now calculate the radius as follows:
        </p>
        <p>
          <Katex math={formula3(value, 58.5, 0.09)} />
        </p>
        <p>
          After some calculations, we can conclude that the radius
          is <Katex math={String(Math.sqrt(17520 / (Math.PI * value * 58.5 * 0.09)))} /> kilometers.
        </p>
        <h3 id="result">
          So there you go, in a radius of <Katex math={String(Math.sqrt(17520 / (Math.PI * value * 58.5 * 0.09)))} />
          kilometers, you are likely to find at least two individuals engaging in sexual activity!
        </h3>
      {/await}
    {/if}
  </div>


  <p>
    Check out <a href="https://svelte.dev/" target="_blank" rel="noreferrer">Svelte</a> 
    <img class="logo svelte" src={svelteLogo} alt="Svelte logo" />, the framework that
    powers this website, and <a href="https://vitejs.dev/" target="_blank" rel="noreferrer">Vite</a>
    <img class="logo" src={viteLogo} alt="Vite logo" />, the tool that makes it possible!
  </p>

  <p>
    This website is based on the XKCD comic <a href="https://xkcd.com/563/" target="_blank" rel="noreferrer">https://xkcd.com/563/</a>,
    "Fermirotica", by Randall Munroe, licensed under a <a href="https://creativecommons.org/licenses/by-nc/2.5/" target="_blank" rel="noreferrer">Creative Commons Attribution-NonCommercial 2.5 License</a>.
  </p>
</main>

<style>
  .logo {
    height: 1em;
    will-change: filter;
    transition: filter 300ms;
  }
  .logo:hover {
    filter: drop-shadow(0 0 2em #646cffaa);
  }
  .logo.svelte:hover {
    filter: drop-shadow(0 0 2em #ff3e00aa);
  }
  .read-the-docs {
    color: #888;
  }
</style>
