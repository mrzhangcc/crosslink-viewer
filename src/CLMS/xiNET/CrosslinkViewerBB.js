//  xiNET
//
//  Colin Combe, Martin Graham, Rappsilber Laboratory, 2015
//
//  CrosslinkViewerBB.js

var CLMS = CLMS || {};
//crosslink-viewer's javascript namespace
CLMS.xiNET = {}; //TODO? change to CLMS.view.xiNET

CLMS.xiNET.CrosslinkViewer = Backbone.View.extend({

    svgns: "http://www.w3.org/2000/svg",// namespace for svg elements
    linkWidth: 1.1,// default line width
    //static var's signifying Controller's status
    STATES: {MOUSE_UP:0, SELECT_PAN:1, DRAGGING:2, ROTATING:3, SELECTING: 6},
            /*SCALING_PROTEIN: 4, SCALING_ALL_PROTEINS: 5,*/

    initialize: function () {

        this.clickModeIsSelect = false;

        //avoids prob with 'save - web page complete'
        d3.select(this.el).selectAll("*").remove();

        //create SVG elemnent
        this.svgElement = d3.select(this.el).append("div").style("height", "100%").append("svg").node();//document.createElementNS(this.svgns, "svg");
        this.svgElement.setAttribute("width", "100%");
        this.svgElement.setAttribute("height", "100%");
        this.svgElement.setAttribute("style", "pointer-events:visible");
        //add listeners
        var self = this;
        this.svgElement.onmousedown = function(evt) { self.mouseDown(evt); };
        this.svgElement.onmousemove = function(evt) { self.mouseMove(evt); };
        this.svgElement.onmouseup = function(evt) { self.mouseUp(evt); };
        //this.svgElement.onmouseout = function(evt) { self.mouseOut(evt); };


        //going to use right click ourselves
        var userAgent = navigator.userAgent;

        if (userAgent.indexOf("MSIE") > -1 || userAgent.indexOf("Trident") > -1  || userAgent.indexOf("Edge") > -1) {
            document.oncontextmenu = function(evt) {
                if (evt.preventDefault) { // necessary for addEventListener, works with traditional
                    evt.preventDefault();
                }
                evt.returnValue = false;    // necessary for attachEvent, works with traditional
                return false;           // works with traditional, not with attachEvent or addEventListener
            }
        } else {
                this.svgElement.oncontextmenu = function(evt) {
                if (evt.preventDefault) {     // necessary for addEventListener, works with traditional
                    evt.preventDefault();
                }
                evt.returnValue = false;    // necessary for attachEvent, works with traditional
                return false;           // works with traditional, not with attachEvent or addEventListener
            }
        };

        var mousewheelevt= (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel" //FF doesn't recognize mousewheel as of FF3.x
        if (document.attachEvent){ //if IE (and Opera depending on user setting)
            this.svgElement.attachEvent("on"+mousewheelevt, function(evt) {self.mouseWheel(evt);});
        }
        else if (document.addEventListener) { //WC3 browsers
            this.svgElement.addEventListener(mousewheelevt, function(evt) {self.mouseWheel(evt);}, false);
        }
        this.lastMouseUp = new Date().getTime();
        this.svgElement.ontouchstart = function(evt) { self.touchStart(evt); };
        this.svgElement.ontouchmove = function(evt) { self.touchMove(evt); };
        this.svgElement.ontouchend = function(evt) { self.touchEnd(evt); };

        // various SVG groups needed
        this.wrapper = document.createElementNS(this.svgns, "g"); //in effect, a hack for fact firefox doesn't support getCTM on svgElement
        var identM = this.svgElement.createSVGMatrix()
        var s = "matrix(" + identM.a + "," + identM.b + "," + identM.c + "," + identM.d + "," + identM.e + "," + identM.f + ")";
        this.wrapper.setAttribute("transform", s);
        this.container = document.createElementNS(this.svgns, "g");
        this.container.setAttribute("id", "container");
        this.wrapper.appendChild(this.container);
        this.p_pLinksWide = document.createElementNS(this.svgns, "g");
        this.p_pLinksWide.setAttribute("id", "p_pLinksWide");
        this.container.appendChild(this.p_pLinksWide);

        this.proteinLower = document.createElementNS(this.svgns, "g");
        this.proteinLower.setAttribute("id", "proteinLower");
        this.container.appendChild(this.proteinLower);

        this.highlights = document.createElementNS(this.svgns, "g");
        this.highlights.setAttribute("class", "highlights");//proteins also contain highlight groups
        this.container.appendChild(this.highlights);

        this.res_resLinks = document.createElementNS(this.svgns, "g");
        this.res_resLinks.setAttribute("id", "res_resLinks");
        this.container.appendChild(this.res_resLinks);

        this.p_pLinks = document.createElementNS(this.svgns, "g");
        this.p_pLinks.setAttribute("id", "p_pLinks");
        this.container.appendChild(this.p_pLinks);

        this.proteinUpper = document.createElementNS(this.svgns, "g");
        this.proteinUpper.setAttribute("id", "proteinUpper");
        this.container.appendChild(this.proteinUpper);

        this.svgElement.appendChild(this.wrapper);

        //var is a d3 selection unlike those above
        this.selectionRectSel = d3.select(this.svgElement).append("rect")
                .attr("x", 10)
                .attr("y", 10)
                .attr("width", 50)
                .attr("height", 100)
                .attr("stroke", "red")
                .attr("stroke-dasharray","4,4")
                .attr("stroke-dashoffset","32")
                .style("animation", "dash 2s linear infinite")
                .attr("fill", "none")
                .attr("display", "none")
                ;

        this.clear();

        this.update();

        this.listenTo (this.model, "filteringDone", this.render);    // any property changing in the filter model means rerendering this view
        this.listenTo (this.model, "hiddenChanged", this.hiddenParticipantsChanged);
        this.listenTo (this.model, "change:highlights", this.highlightsChanged);
        this.listenTo (this.model, "change:selection", this.selectionChanged);
        this.listenTo (this.model, "change:linkColourAssignment", this.render);
        this.listenTo (this.model, "currentColourModelChanged", this.render); // mjg - when current colour scale changes its internal values
        this.listenTo (this.model.get("annotationTypes"), "change:shown", this.setAnnotations);
        this.listenTo (this.model.get("alignColl"), "bulkAlignChange", this.setAnnotations);
        this.listenTo (this.model, "change:selectedProteins", this.selectedParticipantsChanged);
        this.listenTo (this.model.get("clmsModel"), "change:matches", this.update);

        this.listenTo (CLMSUI.vent, "proteinMetadataUpdated", this.updateProteinNames);

        this.listenTo (CLMSUI.vent, "xiNetDragToSelect", function (){self.clickModeIsSelect = true;});
        this.listenTo (CLMSUI.vent, "xiNetDragToPan", function (){self.clickModeIsSelect = false;});
        this.listenTo (CLMSUI.vent, "xiNetSvgDownload", this.downloadSVG);
        this.listenTo (CLMSUI.vent, "xiNetAutoLayout", this.autoLayout);
        this.listenTo (CLMSUI.vent, "xiNetLoadLayout", this.loadLayout);
        this.listenTo (CLMSUI.vent, "xiNetSaveLayout", this.saveLayout);
        this.listenTo (CLMSUI.vent, "xiNetShowLabels", this.showLabels);
        return this;
    },

    clear: function () {

        if (this.cola) { // cola layout
            this.cola.stop();
        }
        this.cola = null;
        d3.select(this.p_pLinksWide).selectAll("*").remove();
        d3.select(this.highlights).selectAll("*").remove();
        d3.select(this.p_pLinks).selectAll("*").remove();
        d3.select(this.res_resLinks).selectAll("*").remove();
        d3.select(this.proteinLower).selectAll("*").remove();
        d3.select(this.proteinUpper).selectAll("*").remove();

        this.dragElement = null;
        this.dragStart = {};

        this.renderedProteins = new Map();
        this.renderedCrossLinks = new Map();
        this.renderedP_PLinks = new Map();

        this.layout = null;
        this.z = 1;

        this.resetZoom();
        this.state = this.STATES.MOUSE_UP;

    },

    render: function() {
        if (this.wasEmpty) {
            this.wasEmpty = false;
            if (this.model.get("clmsModel").get("xiNETLayout")) {
                this.loadLayout(this.model.get("clmsModel").get("xiNETLayout"));
            } else {
                var renderedParticipantsArr = CLMS.arrayFromMapValues(this.renderedProteins);
                var rpCount = renderedParticipantsArr.length;
                for (var rp = 0 ; rp < rpCount; rp++) {
                    var prot = renderedParticipantsArr[rp];
                    prot.init();
                }
                this.autoLayout();
            };
        }

        CLMS.xiNET.P_PLink.maxNoCrossLinks = 1;
        var pLinksArr = CLMS.arrayFromMapValues(this.renderedP_PLinks);
        var plCount = pLinksArr.length;
        for (var pl = 0; pl < plCount; pl++) {
            var p_pCrossLinkCount = pLinksArr[pl].check();
            if (p_pCrossLinkCount > CLMS.xiNET.P_PLink.maxNoCrossLinks) {
                CLMS.xiNET.P_PLink.maxNoCrossLinks = p_pCrossLinkCount;
            }
        }

        for (pl = 0; pl < plCount; pl++) {
            pLinksArr[pl].update();
        }

        var cLinksArr = CLMS.arrayFromMapValues(this.renderedCrossLinks);
        var clCount = cLinksArr.length;
        for (var cl = 0; cl < clCount; cl++) {
            cLinksArr[cl].check();
        }

    },

    update: function () {
        if (this.cola) { // cola layout
            this.cola.stop();
        }
        this.cola = null;

        var participantsArr = CLMS.arrayFromMapValues(this.model.get("clmsModel").get("participants"));
        var pCount = participantsArr.length;

        this.wasEmpty = (this.renderedProteins.size == 0);

        for (var p =0; p < pCount; p++) {
            var participant = participantsArr[p];
            if (participant.is_decoy == false && this.renderedProteins.has(participant.id) == false) {
                var newProt = new CLMS.xiNET.RenderedProtein(participant, this);
                this.renderedProteins.set(participant.id, newProt);

                var protSize = participant.size;
                if (protSize > CLMS.xiNET.RenderedProtein.MAXSIZE){
                    CLMS.xiNET.RenderedProtein.MAXSIZE = protSize;
                }
                if (this.wasEmpty == false) {
                        newProt.init();
                }
            }
        }
        var width = this.svgElement.parentNode.clientWidth;
        CLMS.xiNET.RenderedProtein.UNITS_PER_RESIDUE = ((width / 2)
                - CLMS.xiNET.RenderedProtein.LABELMAXLENGTH) / CLMS.xiNET.RenderedProtein.MAXSIZE;


        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var prot = renderedParticipantArr[rp];
            this.proteinLower.appendChild(prot.lowerGroup);
            this.proteinUpper.appendChild(prot.upperGroup);
        }

        //may need to comment out following if probs
        /*if (pCount < 3) {
            var renderedParticipantsArr = Array.from(this.renderedProteins.values());
            var rpCount =  renderedParticipantsArr.length;
            for (var rp = 0; rp < rpCount; rp++ ) {
                var renderedParticipant = renderedParticipantsArr[rp];
                //~ if (renderedParticipant.hidden == false) {//todo: appears to be not working
                    //renderedParticipant.busy = false;
                    renderedParticipant.setForm(1);
                //~ }
            }
        }*/

        var crossLinksArr = CLMS.arrayFromMapValues(this.model.get("clmsModel").get("crossLinks"));
        var clCount = crossLinksArr.length;
        var clmsModel = this.model.get("clmsModel");
        for(var cl =0 ; cl < clCount; cl++){
            var crossLink = crossLinksArr[cl];
            if (crossLink.isDecoyLink() == false) {
                if (!this.renderedCrossLinks.has(crossLink.id)) {
                    var renderedCrossLink = new CLMS.xiNET.RenderedCrossLink(crossLink, this);
                    this.renderedCrossLinks.set(crossLink.id, renderedCrossLink);

                    var p_pId = crossLink.fromProtein.id + "-" + crossLink.toProtein.id;
                    var p_pLink = this.renderedP_PLinks.get(p_pId);
                    if (typeof p_pLink == 'undefined') {
                        p_pLink = new CLMS.xiNET.P_PLink(p_pId, crossLink, this);
                        this.renderedP_PLinks.set(p_pId, p_pLink);
                    }
                    p_pLink.crossLinks.push(crossLink);
                }
            }
        }
    },

    reset: function() {
        this.resetZoom();
        this.autoLayout();
    },

    resetZoom: function () {
        this.container.setAttribute("transform", "scale(1)");
        this.scale();
    },

    scale: function () {
        this.z = this.container.getCTM().inverse().a;

        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var prot = renderedParticipantArr[rp];
            prot.setPosition(prot.x, prot.y); // this rescales the protein
            if (prot.form !== 0)
                prot.setAllLineCoordinates();
        }

        var renderedCrossLinksArr = CLMS.arrayFromMapValues(this.renderedCrossLinks);
        var rclCount = renderedCrossLinksArr.length;
        for (var rcl = 0 ; rcl < rclCount; rcl++) {
            var renderedCrossLink = renderedCrossLinksArr[rcl];
            if (renderedCrossLink.shown && renderedCrossLink.crossLink.isSelfLink() === false) {
                renderedCrossLink.line.setAttribute("stroke-width", this.z * this.linkWidth);
                renderedCrossLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                if (renderedCrossLink.crossLink.ambiguous === true) {
                    renderedCrossLink.dashedLine(true); //rescale spacing of dashes
                }
            }
        }

        var p_pLinksArr = CLMS.arrayFromMapValues(this.renderedP_PLinks);
        var plCount = p_pLinksArr.length;
        for (var pl = 0; pl < plCount; pl++) {
            var p_pLink = p_pLinksArr[pl];
            if ((p_pLink.renderedFromProtein != p_pLink.renderedToProtein)
                && p_pLink.renderedFromProtein.form === 0 && p_pLink.renderedToProtein.form === 0) {
                if (p_pLink.line) {
                    p_pLink.line.setAttribute("stroke-width", this.z * this.linkWidth);
                    p_pLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                    p_pLink.thickLine.setAttribute("stroke-width", this.z * p_pLink.w);
                    if (p_pLink.ambiguous) {
                        p_pLink.dashedLine(true); //rescale spacing of dashes
                    }
                }
            }
        }
    },

    setAnnotations: function () {
        var renderedParticipants = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpLen = renderedParticipants.length;
        for (var p = 0; p < rpLen; p++ ) {
            renderedParticipants[p].setPositionalFeatures();
        }
    },

    setCTM: function(element, matrix) {
        var s = "matrix(" + matrix.a + "," + matrix.b + "," + matrix.c + "," + matrix.d + "," + matrix.e + "," + matrix.f + ")";
        element.setAttribute("transform", s);
    },

    /**
     * Handle mousedown event.
     */
    mouseDown: function(evt) {
        //prevent default, but allow propogation
        evt.preventDefault();
        //stop layout
        if (this.cola) {
            this.cola.stop();
        }

        this.dragStart = evt;
        this.state = this.STATES.SELECT_PAN;
        this.mouseMoved = false;

        //var toHighlight = [] // todo we dont have synched participant highlighting
        this.toSelect = [];

        d3.select("#container-menu").style("display", "none");
    },

    // dragging/rotation/SELECT_PAN/selecting
    mouseMove: function(evt) {
        var p = this.getEventPoint(evt);// seems to be correct, see below
        var c = p.matrixTransform(this.container.getCTM().inverse());
        var ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
        var dx = ds.x - c.x;
        var dy = ds.y - c.y;
        if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) {
            this.mouseMoved = true;
        }
        if (this.dragElement != null) { //dragging or rotating
            if (this.state === this.STATES.DRAGGING) {
                // we are currently dragging things around
                var ox, oy, nx, ny;
                if (this.dragElement.participant) {
                    //its a protein - drag it, or drag all selcted if it is selected
                    var toDrag;
                    if (this.dragElement.isSelected === false) {
                        toDrag = [this.dragElement.participant];
                    }
                    else {
                        toDrag = this.model.get("selectedProteins");
                    }

                    for (var d = 0; d < toDrag.length; d++) {
                        var renderedProtein = this.renderedProteins.get(toDrag[d].id);
                        ox = renderedProtein.x;
                        oy = renderedProtein.y;
                        nx = ox - dx;
                        ny = oy - dy;
                        renderedProtein.setPosition(nx, ny);
                        renderedProtein.setAllLineCoordinates();
                    }
                }
                this.dragStart = evt;
            }

            else if (this.state === this.STATES.ROTATING) {
                // Distance from mouse x and center of stick.
                var _dx = c.x - this.dragElement.x
                // Distance from mouse y and center of stick.
                var _dy = c.y - this.dragElement.y;
                //see http://en.wikipedia.org/wiki/Atan2#Motivation
                var centreToMouseAngleRads = Math.atan2(_dy, _dx);
                if (this.whichRotator === 0) {
                    centreToMouseAngleRads = centreToMouseAngleRads + Math.PI;
                }
                var centreToMouseAngleDegrees = centreToMouseAngleRads * (360 / (2 * Math.PI));
                this.dragElement.setRotation(centreToMouseAngleDegrees);
                this.dragElement.setAllLineCoordinates();
            }
            else { //not dragging or rotating yet, maybe we should start
                // don't start dragging just on a click - we need to move the mouse a bit first
                if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) {
                    this.state = this.STATES.DRAGGING;

                }
            }
        }
        else if (this.state === this.STATES.SELECT_PAN) {
            if (this.clickModeIsSelect) {
                //SELECT
                var ds = this.getEventPoint(this.dragStart).matrixTransform(this.wrapper.getCTM().inverse());
                var dx = c.x - ds.x;
                var dy = c.y - ds.y;

                var sx = p.x - ds.x;
                var sy = p.y - ds.y;

                var rectX = ds.x;
                if (sx < 0) {
                    rectX += sx;
                }
                var rectY = ds.y;
                if (sy < 0) {
                    rectY += sy;
                }

                this.selectionRectSel.attr("display", "inline")
                    .attr("x", rectX)
                    .attr("y", rectY)
                    .attr("width", Math.abs(sx))
                    .attr("height", Math.abs(sy));
                ;

                var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
                var rpCount = renderedParticipantArr.length;
                for (var rp = 0 ; rp < rpCount; rp++) {
                    var renderedParticipant = renderedParticipantArr[rp];
                    if (renderedParticipant.participant.hidden !== true) {
                        var svgRect = this.svgElement.createSVGRect();
                        svgRect.x = rectX;
                        svgRect.y = rectY;
                        svgRect.width = Math.abs(sx);
                        svgRect.height = Math.abs(sy);
                        var intersects = this.svgElement.getIntersectionList(svgRect, renderedParticipant.upperGroup );
                        if (intersects.length > 0) {
                            renderedParticipant.showHighlight(true);
                            this.toSelect.push(renderedParticipant.participant);
                        } else {
                            renderedParticipant.showHighlight(false);
                        }
                    }

                }


            } else {
                //PAN
                var ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
                var dx = c.x - ds.x;
                var dy = c.y - ds.y;

                this.setCTM(this.container,
                            this.container.getCTM()
                            .translate(dx, dy)
                            );
                this.dragStart = evt;
            }
        }
    },


    // this ends all dragging and rotating
    mouseUp: function(evt) {
        this.preventDefaultsAndStopPropagation(evt);

        //remove selection rect, may not be shown but just do this now
        this.selectionRectSel.attr("display", "none");

        //eliminate some spurious mouse up events
        var time = new Date().getTime();
        if ((time - this.lastMouseUp) > 150){

            var rightclick, middleclick; //which button has just been raised
            if (evt.which)
                rightclick = (evt.which === 3);
            else if (evt.button)
                rightclick = (evt.button === 2);
            if (evt.which)
                middleclick = (evt.which === 2);
            else if (evt.button)
                middleclick = (evt.button === 1);

            var p = this.getEventPoint(evt);
            var c = p.matrixTransform(this.container.getCTM().inverse());

            if (this.dragElement != null) { // a thing has been clicked
                if (!(this.state === this.STATES.DRAGGING || this.state === this.STATES.ROTATING)) { //not dragging or rotating
                        if (this.dragElement.x) { //if the thing is a protein
                            if (rightclick) {
                                if (evt.ctrlKey || evt.shiftKey) {
                                    this.dragElement.switchStickScale(c);
                                }else {
                                    //~ if (this.dragElement.isSelected) {
                                        //~ this.model.get("tooltipModel").set("contents", null);
                                        //~ var menu = d3.select("#container-menu")
                                        //~ menu.style("top", evt.pageY + "px").style("left", evt.pageX + "px").style("display", "block");
                                    //~ } else {
                                        if (this.dragElement.form === 1) {
                                            this.dragElement.setForm(0, c);
                                        } else {
                                            this.dragElement.setForm(1, c);
                                        }
                                    //~ }
                                }
                            } else  {
                                var add = evt.ctrlKey || evt.shiftKey;
                                this.model.setSelectedProteins([this.dragElement.participant], add);
                            }
                        } // else flip selflink
                }
                else if (this.state === this.STATES.ROTATING) {
                    //round protein rotation to nearest 5 degrees (looks neater)
                    this.dragElement.setRotation(Math.round(this.dragElement.rotation / 5) * 5);
                }
                else {
                } //end of protein drag; do nothing
            }
            else if (!this.mouseMoved) { //unselect crosslinks
                this.model.setMarkedCrossLinks("selection", [], false, add);
                //~ if (!this.clickModeIsSelect) {
                    this.model.setSelectedProteins([]);
                //~ }
            } else if (this.clickModeIsSelect) {
                var add = evt.ctrlKey || evt.shiftKey;
                this.model.setSelectedProteins(this.toSelect, add);
            }

            this.dragElement = null;
            this.whichRotator = -1;
            this.state = this.STATES.MOUSE_UP;

        }


        this.lastMouseUp = time;
        return false;
    },

    /**
     * Handle mouse wheel event.
     */
    mouseWheel: function(evt) {
        this.preventDefaultsAndStopPropagation(evt);
        var delta;
        //see http://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
        if (evt.wheelDelta) {
            delta = evt.wheelDelta / 3600; // Chrome/Safari
        }
        else {
            delta = evt.detail / -90; // Mozilla
        }
        var z = 1 + delta;
        var g = this.container;
        var p = this.getEventPoint(evt);
        var c = p.matrixTransform(g.getCTM().inverse());
        var k = this.svgElement.createSVGMatrix().translate(c.x, c.y).scale(z).translate(-c.x, -c.y);
        this.setCTM(g, g.getCTM().multiply(k));
        this.scale();
        return false;
    },

    mouseOut: function(evt) {
        d3.select("#container-menu").style("display", "none");
    },

    getEventPoint: function(evt) {
        var p = this.svgElement.createSVGPoint();
        var element = this.svgElement.parentNode;
        var top = 0, left = 0;
        do {
            top += element.offsetTop  || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent;
       } while(element);
        p.x = evt.clientX - left;//CLMSUI.utils.crossBrowserElementX(evt);//, this.svgElement);
        p.y = evt.clientY - top;//CLMSUI.utils.crossBrowserElementY(evt);//, this.svgElement);
        return p;
    },

    //stop event propogation and defaults; only do what we ask
    preventDefaultsAndStopPropagation: function(evt) {
        if (evt.stopPropagation)
            evt.stopPropagation();
        if (evt.cancelBubble != null)
            evt.cancelBubble = true;
        if (evt.preventDefault)
            evt.preventDefault();
        // evt.returnValue = false;
    },

    saveLayout: function (callback) {
        var myJSONText = JSON.stringify(CLMS.arrayFromMapValues(this.renderedProteins), null, '\t');
        var layout = myJSONText.replace(/\\u0000/gi, '');
        callback(layout);
    },

    loadLayout: function(layout) {
        for (var prot in layout) {
            var protLayout = layout[prot];
            var protein = this.renderedProteins.get(protLayout.id);
            if (protein !== undefined) {
                protein.setPosition(protLayout["x"], protLayout["y"]);
                if (typeof protLayout['rot'] !== 'undefined') {
                    protein.rotation = protLayout["rot"] - 0;
                }
                protein.x = protLayout["x"];
                protein.y =  protLayout["y"];
                protein.form = protLayout["form"] - 0;
                protein.stickZoom = protLayout["stickZoom"];
                protein.rotation = protLayout["rot"] - 0;
                protein.flipped = protLayout["flipped"];
                protein.manuallyHidden = protLayout["manuallyHidden"];
            }
            else {console.log("! protein in layout but not search:" + protLayout.id);}
        }

        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var prot = renderedParticipantArr[rp];
            prot.init();
        }
    },

    autoLayout: function() {
        if (this.cola) {
            this.cola.stop();
        }

        var nodes = []; // not hidden nodes
        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var renderedParticipant = renderedParticipantArr[rp];
            if (renderedParticipant.participant.hidden === false) {
                nodes.push(renderedParticipant);
            }
        }

        this.cola = cola.d3adaptor().avoidOverlaps(true).nodes(nodes);

        var links = new Map();

        var filteredCrossLinks = this.model.getFilteredCrossLinks();
        var clCount = filteredCrossLinks.length;
        for(var cl = 0; cl < clCount; ++cl){
            var crossLink = filteredCrossLinks[cl];
            //visible, non-self cross-links only
            if (crossLink.isSelfLink() === false) {
                var fromId = crossLink.fromProtein.id;
                var toId = crossLink.toProtein.id;
                var linkId = fromId + "-" + toId;
                if (!links.has(linkId)){
                    var linkObj = {};
                    linkObj.source = this.renderedProteins.get(crossLink.fromProtein.id);
                    linkObj.target = this.renderedProteins.get(crossLink.toProtein.id);
                    linkObj.id = linkId;
                    links.set(linkId, linkObj);
                }
            }
        }

        var bBox = this.svgElement.getBoundingClientRect();
        var width = bBox.width;
        var height = bBox.height;
        var k = 30;//Math.sqrt((width * height ) / (this.renderedProteins.size * this.renderedProteins.size));

        var linkArr = CLMS.arrayFromMapValues(links);

        this.cola.size([width, height]).links(linkArr);

        var self = this;

        this.cola.symmetricDiffLinkLengths(k).on("tick", function(e) {
            var nodesArr = self.cola.nodes(); // these nodes are our RenderedProteins
            var nCount = nodesArr.length;
            for (var n = 0; n < nCount; n++) {
                var node = nodesArr[n];
                var offsetX = node.x;// - node.upperGroup.getBBox().x;
                var offsetY = node.y ;//- node.upperGroup.getBBox().y;
                node.setPosition(offsetX, offsetY);
                node.setAllLineCoordinates();
            }
        });
        this.cola.start(10, 15, 20);
    },

    downloadSVG: function () {
        var svgArr = [this.svgElement];
        var svgStrings = CLMSUI.svgUtils.capture (svgArr);
        var svgXML = CLMSUI.svgUtils.makeXMLStr (new XMLSerializer(), svgStrings[0]);

        //bit of a hack
        var bBox = this.svgElement.getBoundingClientRect();
        var width = Math.round(bBox.width);
        var height = Math.round(bBox.height);
        svgXML = svgXML.replace('width="100%"','width="'+width+'px"');
        svgXML = svgXML.replace('height="100%"','height="'+height+'px"');

        var fileName = CLMSUI.utils.makeLegalFileName (CLMSUI.utils.searchesToString()+"--xiNET--"+CLMSUI.utils.filterStateToString());
        download (svgXML, 'application/svg', fileName+".svg");
    },

    highlightsChanged: function () {
        var pLinksArr = CLMS.arrayFromMapValues(this.renderedP_PLinks);
        var plCount = pLinksArr.length;
        for (var pl = 0; pl < plCount; pl++) {
            pLinksArr[pl].showHighlight(false);
        }

        var highlightedCrossLinks = this.model.getMarkedCrossLinks("highlights");
        var renderedCrossLinksArr = CLMS.arrayFromMapValues(this.renderedCrossLinks);
        var rclCount = renderedCrossLinksArr.length;
        for (var rcl =0; rcl < rclCount; rcl++) {
            var renderedCrossLink = renderedCrossLinksArr[rcl];
            if (highlightedCrossLinks.indexOf(renderedCrossLink.crossLink) != -1) {
                if (renderedCrossLink.renderedFromProtein.form == 1
                    || renderedCrossLink.renderedToProtein.form == 1) {
                    renderedCrossLink.showHighlight(true);
                } else {
                    var p_pLink = this.renderedP_PLinks.get(
                        renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
                    p_pLink.showHighlight(true);
                }
            }
            else {
                renderedCrossLink.showHighlight(false);
            }
        }
        return this;
    },

    selectionChanged: function () {
        var pLinksArr = CLMS.arrayFromMapValues(this.renderedP_PLinks);
        var plCount = pLinksArr.length;
        for (var pl = 0; pl < plCount; pl++) {
            pLinksArr[pl].setSelected(false);
        }

        var selectedCrossLinks = this.model.getMarkedCrossLinks("selection");
        var renderedCrossLinksArr = CLMS.arrayFromMapValues(this.renderedCrossLinks);
        var rclCount = renderedCrossLinksArr.length;
        for (var rcl =0; rcl < rclCount; rcl++) {
            var renderedCrossLink = renderedCrossLinksArr[rcl];
            if (selectedCrossLinks.indexOf(renderedCrossLink.crossLink) != -1) {
                renderedCrossLink.setSelected(true);
                var p_pLink = this.renderedP_PLinks.get(
                    renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
                p_pLink.setSelected(true);
            }else {
                renderedCrossLink.setSelected(false);
            }
        }
        return this;
    },

    selectedParticipantsChanged: function () {
        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var selectedParticipants = this.model.get("selectedProteins");

        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var renderedParticipant = renderedParticipantArr[rp];
            if (selectedParticipants.indexOf(renderedParticipant.participant) == -1 && renderedParticipant.isSelected == true) {
                renderedParticipant.setSelected(false);
            }
        }

        //~ var selectedParticipantsArr = CLMS.arrayFromMapValues(selectedParticipants)
        var spCount = selectedParticipants.length
        for (var sp =0; sp < spCount; sp++ ) {
            if (selectedParticipants[sp].is_decoy != true) {
                var renderedParticipant = this.renderedProteins.get(selectedParticipants[sp].id);
                if (renderedParticipant.isSelected == false) {
                    renderedParticipant.setSelected(true);
                }
            }
        }
        return this;
    },

    hiddenParticipantsChanged: function () {
        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        var manuallyHidden = 0;
        for (var rp = 0 ; rp < rpCount; rp++) {
            var renderedParticipant = renderedParticipantArr[rp];
            if (renderedParticipant.hidden != renderedParticipant.participant.hidden) {
                renderedParticipant.setHidden(renderedParticipant.participant.hidden);
            }
            if (renderedParticipant.participant.manuallyHidden == true) {
                manuallyHidden++;
            }
        }

        if (manuallyHidden == 0) {
            d3.select("#hiddenProteinsMessage").style("display", "none");
        } else {
                var pSel = d3.select("#hiddenProteinsText");
                pSel.text((manuallyHidden > 1) ? (manuallyHidden + " Hidden Proteins") : (manuallyHidden + " Hidden Protein"));
                var messgeSel = d3.select("#hiddenProteinsMessage");
                messgeSel.style("display", "block");
        }

        return this;
    },
    
    updateProteinNames: function () {
        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            renderedParticipantArr[rp].updateName();
        }

        return this;
    },
        
    showLabels: function (show) {
        var renderedParticipantArr = CLMS.arrayFromMapValues(this.renderedProteins);
        var rpCount = renderedParticipantArr.length;
        for (var rp = 0 ; rp < rpCount; rp++) {
            renderedParticipantArr[rp].showLabel(show);
        }
        return this;
    },

});
