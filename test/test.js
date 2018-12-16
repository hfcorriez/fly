const obj = {
  props: {
    a: 'b'
  },

  main: function () {
    console.log('main', this.props)
  }
}

~(obj.main())
