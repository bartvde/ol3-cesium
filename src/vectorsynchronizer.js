goog.provide('olcs.VectorSynchronizer');

goog.require('ol.layer.Vector');
goog.require('olcs.AbstractSynchronizer');
goog.require('olcs.FeatureConverter');
goog.require('olcs.core');
goog.require('olcs.core.VectorLayerCounterpart');



/**
 * Unidirectionally synchronize OpenLayers vector layers to Cesium.
 * @param {!ol.Map} map
 * @param {!Cesium.Scene} scene
 * @param {olcs.FeatureConverter=} opt_converter
 * @constructor
 * @extends {olcs.AbstractSynchronizer.<olcs.core.VectorLayerCounterpart>}
 * @api
 */
olcs.VectorSynchronizer = function(map, scene, opt_converter) {

  /**
   * @protected
   */
  this.converter = opt_converter || new olcs.FeatureConverter(scene);

  /**
   * @private
   */
  this.csAllPrimitives_ = new Cesium.PrimitiveCollection();
  scene.primitives.add(this.csAllPrimitives_);
  this.csAllPrimitives_.destroyPrimitives = false;

  goog.base(this, map, scene);
};
goog.inherits(olcs.VectorSynchronizer, olcs.AbstractSynchronizer);


/**
 * @inheritDoc
 */
olcs.VectorSynchronizer.prototype.addCesiumObject = function(counterpart) {
  goog.asserts.assert(!goog.isNull(counterpart));
  counterpart.getRootPrimitive()['counterpart'] = counterpart;
  this.csAllPrimitives_.add(counterpart.getRootPrimitive());
};


/**
 * @inheritDoc
 */
olcs.VectorSynchronizer.prototype.destroyCesiumObject = function(object) {
  object.getRootPrimitive().destroy();
};


/**
 * @inheritDoc
 */
olcs.VectorSynchronizer.prototype.removeSingleCesiumObject =
    function(object, destroy) {
  object.destroy();
  this.csAllPrimitives_.destroyPrimitives = destroy;
  this.csAllPrimitives_.remove(object.getRootPrimitive());
  this.csAllPrimitives_.destroyPrimitives = false;
};


/**
 * @inheritDoc
 */
olcs.VectorSynchronizer.prototype.removeAllCesiumObjects = function(destroy) {
  this.csAllPrimitives_.destroyPrimitives = destroy;
  if (destroy) {
    for (var i = 0; i < this.csAllPrimitives_.length; ++i) {
      this.csAllPrimitives_.get(i)['counterpart'].destroy();
    }
  }
  this.csAllPrimitives_.removeAll();
  this.csAllPrimitives_.destroyPrimitives = false;
};


/**
 * @inheritDoc
 */
olcs.VectorSynchronizer.prototype.createSingleCounterpart = function(olLayer) {
  if (!(olLayer instanceof ol.layer.Vector)) {
    return null;
  }
  goog.asserts.assertInstanceof(olLayer, ol.layer.Vector);
  goog.asserts.assert(!goog.isNull(this.view));

  var view = this.view;
  var source = olLayer.getSource();
  var featurePrimitiveMap = {};
  var counterpart = this.converter.olVectorLayerToCesium(olLayer, view,
      featurePrimitiveMap);
  var csPrimitives = counterpart.getRootPrimitive();
  var olListenKeys = counterpart.olListenKeys;

  olListenKeys.push(olLayer.on('change:visible', function(e) {
    csPrimitives.show = olLayer.getVisible();
  }));

  var onAddFeature = goog.bind(function(feature) {
    goog.asserts.assertInstanceof(olLayer, ol.layer.Vector);
    var context = counterpart.context;
    var prim = this.converter.convert(olLayer, view, feature, context);
    if (prim) {
      featurePrimitiveMap[goog.getUid(feature)] = prim;
      csPrimitives.add(prim);
    }
  }, this);

  var onRemoveFeature = goog.bind(function(feature) {
    var geometry = feature.getGeometry();
    var id = goog.getUid(feature);
    if (!geometry || geometry.getType() == 'Point') {
      var context = counterpart.context;
      var bb = context.featureToCesiumMap[id];
      delete context.featureToCesiumMap[id];
      if (bb instanceof Cesium.Billboard) {
        context.billboards.remove(bb);
      }
    }
    var csPrimitive = featurePrimitiveMap[id];
    delete featurePrimitiveMap[id];
    if (goog.isDefAndNotNull(csPrimitive)) {
      csPrimitives.remove(csPrimitive);
    }
  }, this);

  olListenKeys.push(source.on('addfeature', function(e) {
    goog.asserts.assert(goog.isDefAndNotNull(e.feature));
    onAddFeature(e.feature);
  }, this));

  olListenKeys.push(source.on('removefeature', function(e) {
    goog.asserts.assert(goog.isDefAndNotNull(e.feature));
    onRemoveFeature(e.feature);
  }, this));

  olListenKeys.push(source.on('changefeature', function(e) {
    var feature = e.feature;
    goog.asserts.assert(goog.isDefAndNotNull(feature));
    onRemoveFeature(feature);
    onAddFeature(feature);
  }, this));

  return counterpart;
};
