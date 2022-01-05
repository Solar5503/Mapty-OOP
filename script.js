'use strict';
class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat,lng]
    this.distance = distance; //km
    this.duration = duration; //min
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}
class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

/////////////////////////////////////////////
//~Application architecture

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const clearAllBtn = document.querySelector('.sidebar__btn--clearAll');
const sortDistanceBtn = document.querySelector('.sidebar__btn--sortDistance');
const sortTimeBtn = document.querySelector('.sidebar__btn--sortTime');
const cancelBtn = document.querySelector('.form__btn--cancel');

class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #layers = [];
  #sortedByDistance = false;
  #sortedByTime = false;

  constructor() {
    // Get user position
    this._getPositon();

    // Get data from Local Storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._editWorkout.bind(this));
    clearAllBtn.addEventListener('click', () => {
      this.resetAllWorkots();
      speechSynthesis.cancel();
      this.pronounceSentence(`All workouts deleted`);
    });
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      location.reload();
    });
    sortDistanceBtn.addEventListener('click', () => {
      this._sort('distance', !this.#sortedByDistance);
      this.#sortedByDistance = !this.#sortedByDistance;
      speechSynthesis.cancel();
      this.pronounceSentence(`Sorted by distance`);
    });
    sortTimeBtn.addEventListener('click', () => {
      this._sort('time', !this.#sortedByTime);
      this.#sortedByTime = !this.#sortedByTime;
      speechSynthesis.cancel();
      this.pronounceSentence(`Sorted by time`);
    });
  }

  _getPositon() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          document.getElementById('map').innerText =
            '❌  Could not get your position!';
        }
      );
    }
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;
    const coords = [latitude, longitude];

    if (this.#workouts.length === 0)
      this.#map = L.map('map').setView(coords, this.#mapZoomLevel);
    // Check if is there workouts then set map to average position
    else {
      let latAverage = 0;
      let lngAverage = 0;
      let maxLat = -Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let minLng = Infinity;
      this.#workouts.forEach((work) => {
        latAverage += work.coords[0];
        lngAverage += work.coords[1];

        // Calc max and min coords
        if (work.coords[0] > maxLat) maxLat = work.coords[0];
        if (work.coords[1] > maxLng) maxLng = work.coords[1];
        if (work.coords[0] < minLat) minLat = work.coords[0];
        if (work.coords[1] < minLng) minLng = work.coords[1];
      });
      latAverage = parseFloat((latAverage / this.#workouts.length).toFixed(2));
      lngAverage = parseFloat((lngAverage / this.#workouts.length).toFixed(2));

      // To accommodate all workouts on map
      if (maxLat - minLat >= 0.086 || maxLng - minLng >= 0.2)
        this.#mapZoomLevel = 12;

      // Set map to average position
      this.#map = L.map('map').setView(
        [latAverage, lngAverage],
        this.#mapZoomLevel
      );
    }

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    //Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    //Render all markers on map from Local Storage
    this.#workouts.forEach((work) => {
      this._renderWorkoutMarker(work);
    });
  }

  _showForm(mapE) {
    form.classList.remove('hidden');
    inputDistance.focus();
    this.#mapEvent = mapE;
  }

  _hideForm() {
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';
    inputDistance.focus();
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);

    inputDistance.classList.remove('form__input--success');
    inputDuration.classList.remove('form__input--success');
    inputCadence.classList.remove('form__input--success');
    inputElevation.classList.remove('form__input--success');
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    e.preventDefault();

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    // If workout running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;

      // Check if data is valid
      if (
        !this._checkInput(distance, inputDistance) ||
        !this._checkInput(duration, inputDuration) ||
        !this._checkInput(cadence, inputCadence)
      )
        return;

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If workout cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;

      if (
        !this._checkInput(distance, inputDistance) ||
        !this._checkInput(duration, inputDuration) ||
        !this._checkInput(elevation, inputElevation)
      )
        return;

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    // Add new object to workout array
    this.#workouts.push(workout);

    // Render workout on map as marker
    this._renderWorkoutMarker(workout);

    // Render workout on list
    this._renderWorkout(workout);

    // Hide form + clear input fields
    this._hideForm();

    // Set local storage to all workouts
    this._setLocalStorage();

    // Pronounce create workout
    this.pronounceSentence(`Workout created or changed`);
  }

  _checkInput(input, inputName) {
    if (
      !(Number.isFinite(input) && input > 0) &&
      !inputName.classList.contains('form__input--elevation')
    ) {
      inputName.classList.add('form__input--error');
      inputName.nextElementSibling.style.visibility = 'visible';
      return false;
    } else {
      if (
        inputName.classList.contains('form__input--elevation') &&
        !Number.isFinite(input)
      ) {
        inputName.classList.add('form__input--error');
        inputName.nextElementSibling.style.visibility = 'visible';
        return false;
      }

      inputName.classList.remove('form__input--error');
      inputName.nextElementSibling.style.visibility = 'hidden';
      inputName.classList.add('form__input--success');
      return true;
    }
  }

  _renderWorkoutMarker(workout) {
    const layer = L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup();
    this.#layers.push(layer);
  }

  _renderWorkout(workout) {
    let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <h2 class="workout__title">${workout.description}</h2>
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
          }</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
    `;
    if (workout.type === 'running')
      html += `
              <div class="workout__details">
                <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.pace.toFixed(1)}</span>
                <span class="workout__unit">min/km</span>
              </div>
              <div class="workout__details">
                <span class="workout__icon">🦶🏼</span>
                <span class="workout__value">${workout.cadence}</span>
                <span class="workout__unit">spm</span>
              </div>
              <div class="workout__control">
                <button class="workout__btn workout__btn--clear">🗑 Clear</button>
                <button class="workout__btn workout__btn--edit">📝 Edit</button>
              </div>
          </li>
      `;

    if (workout.type === 'cycling')
      html += `
              <div class="workout__details">
                <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.speed.toFixed(1)}</span>
                <span class="workout__unit">km/h</span>
              </div>
              <div class="workout__details">
                <span class="workout__icon">⛰</span>
                <span class="workout__value">${workout.elevationGain}</span>
                <span class="workout__unit">m</span>
              </div>
              <div class="workout__control">
                <button class="workout__btn workout__btn--clear">🗑 Clear</button>
                <button class="workout__btn workout__btn--edit">📝 Edit</button>
              </div>
            </li>
          `;

    form.insertAdjacentHTML('afterend', html);
  }

  _editWorkout(e) {
    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;
    let index = 0;
    const workout = this.#workouts.find((work, i) => {
      index = i;
      return work.id === workoutEl.dataset.id;
    });

    // Move on current point of map
    this.#map.setView(workout.coords, 15, {
      animate: true,
      pan: {
        duration: 1,
      },
    });

    // Pronounce workout
    if (workout.type === 'running') {
      speechSynthesis.cancel();
      this.pronounceSentence(workout.description);
      this.pronounceSentence(`distance ${workout.distance} kilometers`);
      this.pronounceSentence(`duration ${workout.duration} minutes`);
      this.pronounceSentence(
        `pace ${workout.pace.toFixed(1)} minutes per kilometer`
      );
      this.pronounceSentence(`cadence ${workout.cadence} steps per minute`);
    }
    if (workout.type === 'cycling') {
      speechSynthesis.cancel();
      this.pronounceSentence(workout.description);
      this.pronounceSentence(`distance ${workout.distance} kilometers`);
      this.pronounceSentence(`duration ${workout.duration} minutes`);
      this.pronounceSentence(
        `speed ${workout.speed.toFixed(1)} kilometers per hour`
      );
      this.pronounceSentence(`elevation gain ${workout.elevationGain} meters`);
    }

    //delete workout and reload
    if (e.target.classList.contains('workout__btn--clear')) {
      // Pronounce delete workout
      speechSynthesis.cancel();
      this.pronounceSentence(`Workout deleted`);

      this.#workouts.splice(index, 1);
      this._setLocalStorage();
      location.reload();
    }

    // Edit workout
    if (e.target.classList.contains('workout__btn--edit')) {
      speechSynthesis.cancel();

      // Delete old workout
      this.#workouts.splice(index, 1);

      // Show form with our coords
      this.#mapEvent = {
        latlng: {
          lat: workout.coords[0],
          lng: workout.coords[1],
        },
      };
      this._showForm(this.#mapEvent);
      this._updateUI();
    }

    // using the public interface
    workout.click();
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));
    if (!data) return;

    // Join prototypes of objects from local storage with prototype of classes
    data.forEach((work) => {
      if (work.type === 'running') {
        work.__proto__ = Object.create(Running.prototype);
      }
      if (work.type === 'cycling') {
        work.__proto__ = Object.create(Cycling.prototype);
      }
    });

    this.#workouts = data;
    this.#workouts.forEach((work) => {
      this._renderWorkout(work);
    });
  }

  _updateUI() {
    containerWorkouts
      .querySelectorAll('.workout')
      .forEach((work) => work.remove());
    this.#layers.forEach((layer) => {
      layer.remove();
    });
    this.#layers = [];

    this.#workouts.forEach((work) => {
      this._renderWorkout(work);
      this._renderWorkoutMarker(work);
    });
  }

  resetAllWorkots() {
    localStorage.removeItem('workouts');
    location.reload();
  }

  _sort(key, sort) {
    containerWorkouts
      .querySelectorAll('.workout')
      .forEach((work) => work.remove());

    if (key === 'distance') {
      const workouts = sort
        ? this.#workouts.slice().sort((a, b) => a.distance - b.distance)
        : this.#workouts;
      workouts.forEach((work) => this._renderWorkout(work));
    }

    if (key === 'time') {
      const workouts = sort
        ? this.#workouts.slice().sort((a, b) => a.duration - b.duration)
        : this.#workouts;
      workouts.forEach((work) => this._renderWorkout(work));
    }
  }

  pronounceSentence(text) {
    // Init speech synthes
    const sentence = new SpeechSynthesisUtterance();
    // Correction of pronunciation in English
    sentence.lang = 'en-US';
    // phrase pronunciation speed
    sentence.rate = 0.7;
    // Set text
    sentence.text = text;
    // Speak text
    speechSynthesis.speak(sentence);
  }
}

const app = new App();
