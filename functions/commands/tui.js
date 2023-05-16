const blessed = require('blessed')

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true
})

// Create a scrolling log box.
const logBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '50%',
  keys: true,
  mouse: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    track: {
      bg: 'yellow'
    },
    style: {
      inverse: true
    }
  }
})

// Create an output box for command results.
const outputBox = blessed.box({
  top: '50%',
  left: 0,
  width: '100%',
  height: '45%',
  keys: true,
  mouse: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    track: {
      bg: 'yellow'
    },
    style: {
      inverse: true
    }
  }
})

// Create a command input line.
const inputLine = blessed.textbox({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  keys: true,
  mouse: true,
  inputOnFocus: true,
  style: {
    fg: 'white',
    bg: 'blue'
  }
})

// Append elements to the screen.
screen.append(logBox)
screen.append(outputBox)
screen.append(inputLine)

// Focus on the input line.
inputLine.focus()

// Log sample messages.
logBox.pushLine('This is a log message.')
logBox.pushLine('Another log message.')

// Listen for submit event on input line.
inputLine.on('submit', (value) => {
  // Clear input line.
  inputLine.clearValue()

  // Add the command output to the output box.
  outputBox.pushLine(`Command "${value}" executed.`)

  // Refresh the screen.
  screen.render()
  inputLine.focus()
})

// Quit the application with 'q' key or 'C-c'.
screen.key(['q', 'C-c'], () => process.exit(0))

// Render the screen.
screen.render()
