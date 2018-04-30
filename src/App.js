import React, { Component } from 'react';
import { withState, withHandlers, compose } from 'recompose';
import axios from 'axios';
import { AutoSizer, Grid, ScrollSync, MultiGrid } from 'react-virtualized';
import * as R from 'ramda';
import cx from 'classnames';
import './App.css';

window.R = R;

const groupChildren = (rows, data, metrics = [], withTotals = false) => {
  return (function _r(data, level) {
    if(!data) {
      return null;
    }

    if(level >= rows.length) {
      return null;
    }

    let totals = [];
    if(withTotals && data.length > 1) {
      totals = totals.concat(
        {label: '__totals', count: 0,  children: null, total: true, level: rows.length - level}
      );
    }

    let grouped =  data.reduce((acc, c ) => {
      const children = _r(c.split, level+1);
      return [
          ...acc,
          {
            label: c[rows[level]],
            childrenCount: totals.length + (children ? children.length : 0),
            children,
          }];
    }, []).concat(totals);

    return grouped;
  })(data, 0);
}

const getLeafCount = (c) =>  !c.children ? 1 : c.children.reduce((a, c) => a + getLeafCount(c), 0);

const toArray = (data, level = 0) => {
 return data.reduce((acc, c) => {

  const count = getLeafCount(c);

  if(!c.children) {
    return [...acc, [{...c, label: c.label, count: 1, root: true}]];
  }

  const arr = [[{label: c.label, count, root }]];
  for(let i=0; i<count; i++) {
    if(!arr[i]) {
      arr[i] = [{...c, label: c.label, count }];
    }
  }

  const children = toArray(c.children, level + 1);

  children.reduce((acc, children, i) => {
    acc[i] = acc[i].concat(children);
    return acc;
  }, arr);

  return [...acc, ...arr];
 }, []);
}

const padNulls = (num) => R.concat(R.repeat(null, num));

const parseData = (dimensions, metrics, data) => {
  return (function _r(data, level) {
    if(level === dimensions.length - 1 ) {
      const currentDimension = dimensions[level];

      return data.reduce((a, c) => {
        a[c[currentDimension]] = R.pick(metrics, c);
        return a;
      }, {});
    }

    return data.reduce((a, c) => {
      const x = _r(c.split, level + 1);
      a[c[dimensions[level]]] = x;
      a[c[dimensions[level]]].__totals = R.pick(metrics, c);

      return a;
    }, {});
  })(data, 0)
}

const addMetricColumnHeaders = ({ metrics, columnMap }) => {
  return columnMap.map((x) =>  {
    if(x.children) {
      const children = addMetricColumnHeaders({ metrics, columnMap: x.children });
      return {...x, count: children.length, children };
    }
    return {
      ...x,
      count: metrics.length,
      children: metrics.map((metric) => ({label: metric, count: 0, children: null}))
    };
  });
}


class App extends Component {
  state = {
    loaded: false,
    rowData: [],
    colsData: [],
    parsedData: [],
    hasColumns: false,
    headerCount: 0,
    rowCount: 0,
    columnCount: 0,

  }

  componentDidMount() {
    axios.get('http://localhost:3002/data')
      .then(_ => _.data)
      .then(x => this.compute({ ...x, rawData: x.result }))
  }

  compute = (arg) => {
    const { rows ,columns, metrics, colUnique, rawData, showTotals  } = {...this.props, ...this.state, ...arg};

    const x = groupChildren(rows, rawData.split, metrics, showTotals);
    const rowData = toArray(x);
    const hasColumns = columns.length > 0;
    let columnMap = colUnique;

    if (hasColumns && metrics.length > 1) {
      columnMap = addMetricColumnHeaders({metrics, columnMap});
    }
    const colsData = toArray(columnMap);
    const headerCount = hasColumns ? columns.length + Math.sign(metrics.length) : 1;

    const parsedData = parseData(rows.concat(columns), metrics, rawData.split);
    parsedData.__totals = R.pick(metrics, rawData);

    this.setState({
      rowData,
      colsData,
      parsedData ,
      hasColumns,
      headerCount,
      rowCount: headerCount + rowData.length,
      columnCount: hasColumns ? rows.length + colsData.length : rows.length + metrics.length,
      loaded: true,
      rows,
      columns,
      metrics,
      rawData,
      colUnique,
    })
  }

  indexGetter = ({startIndex, stopIndex, direction}) => {
    if(direction === 'vertical') {
      let i = startIndex;
      const {rowData: data} = this.state;

      if(data && data[i]) {
        for(; i >= 0 && data[i][0] === null || !data[i][0]['root']; i--);
      }

      return { overscanStartIndex: i >= 0 ? i : 0 , overscanStopIndex: stopIndex };
    }
    return {overscanStartIndex: startIndex, overscanStopIndex: stopIndex};
  }

  renderCell = ({ columnIndex, key, rowIndex, style, }) => {
    const {metrics, rows, rowData, colsData, columns, parsedData, headerCount, hasColumns} = this.state;
    const {showTotals} = this.props;

    const rowOffset = rowIndex - headerCount;
    const columnOffset = columnIndex - rows.length;

    if(!hasColumns && rowIndex === 0) {
      return <div className="grid-header-cell" key={key} style={style}>{rows.concat(metrics)[columnIndex]}</div>
    }

    if(rowOffset < 0) {
        if(columnOffset < 0 && rowIndex === 0) {
          return (
            <div
              className="grid-cell"
              key={key}
              style={{...style, height: style.height * headerCount, backgroundColor: '#FAFAFA' }}
            >
              {rows[columnIndex]}
            </div>
          );
        }
        if(columnOffset >= 0) {
          const item = colsData[columnIndex - rows.length][rowIndex];

          return  (!item || !item.root)  ? null : (
            <div className="grid-cell" key={key} style={{...style, width: style.width * item.count, backgroundColor: '#FAFAFA'}}>{item.label}</div>
          );
      }
      return null;
    }


    if(columnOffset < 0) {
      const item = rowData[rowOffset][columnIndex];

      if(!item || !item.root) {
        return null;
      }
      if (item.total) {
        return <div className='grid-cell total-cell' key={key} style={{...style, width: style.width * item.level}}> Total </div>
      }

      return (<div className="grid-cell" key={key} style={{...style, height: style.height * item.count}}>{item.label}</div>);
    }

    const withoutMetrics = R.reject(
      R.pipe(
        R.prop('label'),
        R.contains(R.__, metrics)
      )
    );

    const value = R.compose(
      R.path(R.__, parsedData),
      R.append(metrics[columnOffset % metrics.length]),
      R.pluck('label') ,
      R.when(
        R.always(hasColumns),
        R.concat(R.__, withoutMetrics(colsData[columnOffset]))
      )
    );
    console.log(rowData[rowOffset]);
    const className = cx('grid-cell', {'total-cell': R.pluck('label', rowData[rowOffset]).includes('__totals')});
    return (<div className={className} key={key} style={{...style}}>{value(rowData[rowOffset])}</div>);
  }

  toggleShowTotals = (e) => {
    this.compute({showTotals: e.target.checked});
    this.props.toggleShowTotals();
  }

  render() {
    const  {
      loaded, rowData, colsData, parsedData, hasColumns, headerCount, rowCount, columnCount, rows, rawData, metrics,
    } = this.state;
    if (!loaded) {
      return 'Loading';
    }

    const x= groupChildren(rows, rawData.split, metrics, true);
    const cellHeight = 50, cellWidth = 150, tableHeight = window.innerHeight;

    return (
      <div style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
        <label>
          <input type="checkbox" checked={this.props.showTotals} onChange={this.toggleShowTotals} />
           Show Totals
        </label>
        <label>
          <input type="checkbox" checked={this.props.fixedCols} onChange={this.props.toggleFixedCols} />
           Fix Cols
        </label>
        <div style={{display: 'flex', justifyContent: 'center'}}>
          <MultiGrid
            cellRenderer={this.renderCell}
            columnWidth={cellWidth}
            columnCount={columnCount}
            rowCount={rowCount}
            rowHeight={cellHeight}
            width={703}
            height={tableHeight}
            fixedColumnCount={this.props.fixedCols ? rows.length : 0}
            fixedRowCount={headerCount}
            enableFixedRowScroll
            enableFixedColumnScroll
            overscanIndicesGetter={this.indexGetter}
          />
        </div>
      </div>
    );
  }
}

const capitalize = word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const withToggle = (name, defaultValue = false) => {
  return compose(
    withState(name, `set${capitalize(name)}`, false),
    withHandlers({
      [`toggle${capitalize(name)}`]: (props) => () => {
          const property = props[name];
          const updater = `set${capitalize(name)}`;
          props[updater](!property);
        }
    })
  )
}

export default compose(
  withToggle('showTotals'),
  withToggle('fixedCols'),
)(App);
