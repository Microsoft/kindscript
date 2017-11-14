/// <reference path="../../localtypings/pxtblockly.d.ts" />

namespace pxtblockly {

    export interface FieldImageDropdownOptions extends Blockly.FieldCustomDropdownOptions {
        columns?: string;
        maxRows?: string;
        width?: string;
        itemColour?: string;
    }

    export class FieldImageDropdown extends Blockly.FieldDropdown implements Blockly.FieldCustom {
        public isFieldCustom_ = true;
        // Width in pixels
        private width_: number;

        // Columns in grid
        private columns_: number;

        // Number of rows to display (if there are extra rows, the picker will be scrollable)
        private maxRows_: number;

        private backgroundColour_: string;
        private itemColour_: string;
        private borderColour_: string;

        constructor(text: string, options: FieldImageDropdownOptions, validator?: Function) {
            super(options.data);

            this.columns_ = parseInt(options.columns);
            this.maxRows_ = parseInt(options.maxRows) || 0;
            this.width_ = parseInt(options.width) || 300;

            this.backgroundColour_ = pxtblockly.parseColour(options.colour);
            this.itemColour_ = options.itemColour || "rgba(255, 255, 255, 0.6)";
            this.borderColour_ = Blockly.PXTUtils.fadeColour(this.backgroundColour_, 0.4, false);
        }

        /**
         * Create a dropdown menu under the text.
         * @private
         */
        public showEditor_() {
            // If there is an existing drop-down we own, this is a request to hide the drop-down.
            if (Blockly.DropDownDiv.hideIfOwner(this)) {
                return;
            }
            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            // Populate the drop-down with the icons for this field.
            let dropdownDiv = Blockly.DropDownDiv.getContentDiv();
            let contentDiv = document.createElement('div');
            // Accessibility properties
            contentDiv.setAttribute('role', 'menu');
            contentDiv.setAttribute('aria-haspopup', 'true');
            const options = this.getOptions();
            for (let i = 0, option: any; option = options[i]; i++) {
                let content = (options[i] as any)[0]; // Human-readable text or image.
                const value = (options[i] as any)[1]; // Language-neutral value.
                // Icons with the type property placeholder take up space but don't have any functionality
                // Use for special-case layouts
                if (content.type == 'placeholder') {
                let placeholder = document.createElement('span');
                    placeholder.setAttribute('class', 'blocklyDropDownPlaceholder');
                    placeholder.style.width = content.width + 'px';
                    placeholder.style.height = content.height + 'px';
                    contentDiv.appendChild(placeholder);
                    continue;
                }
                let button = document.createElement('button');
                button.setAttribute('id', ':' + i); // For aria-activedescendant
                button.setAttribute('role', 'menuitem');
                button.setAttribute('class', 'blocklyDropDownButton');
                button.title = content.alt;
                if (this.columns_) {
                    button.style.width = ((this.width_ / this.columns_) - 8) + 'px';
                    button.style.height = ((this.width_ / this.columns_) - 8) + 'px';
                } else {
                    button.style.width = content.width + 'px';
                    button.style.height = content.height + 'px';
                }
                let backgroundColor = this.backgroundColour_;
                if (value == this.getValue()) {
                    // This icon is selected, show it in a different colour
                    backgroundColor = this.sourceBlock_.getColourTertiary();
                    button.setAttribute('aria-selected', 'true');
                }
                button.style.backgroundColor = backgroundColor;
                button.style.borderColor = this.borderColour_;
                Blockly.bindEvent_(button, 'click', this, this.buttonClick_);
                Blockly.bindEvent_(button, 'mouseup', this, this.buttonClick_);
                // These are applied manually instead of using the :hover pseudoclass
                // because Android has a bad long press "helper" menu and green highlight
                // that we must prevent with ontouchstart preventDefault
                Blockly.bindEvent_(button, 'mousedown', button, function(e) {
                    this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                    e.preventDefault();
                });
                Blockly.bindEvent_(button, 'mouseover', button, function() {
                    this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover');
                    contentDiv.setAttribute('aria-activedescendant', this.id);
                });
                Blockly.bindEvent_(button, 'mouseout', button, function() {
                    this.setAttribute('class', 'blocklyDropDownButton');
                    contentDiv.removeAttribute('aria-activedescendant');
                });
                let buttonImg = document.createElement('img');
                buttonImg.src = content.src;
                //buttonImg.alt = icon.alt;
                // Upon click/touch, we will be able to get the clicked element as e.target
                // Store a data attribute on all possible click targets so we can match it to the icon.
                button.setAttribute('data-value', value);
                buttonImg.setAttribute('data-value', value);
                button.appendChild(buttonImg);
                contentDiv.appendChild(button);
            }
            contentDiv.style.width = this.width_ + 'px';
            dropdownDiv.appendChild(contentDiv);

            Blockly.DropDownDiv.setColour(this.backgroundColour_, this.borderColour_);

            let scale = this.sourceBlock_.workspace.scale;
            // Offset for icon-type horizontal blocks.
            let secondaryYOffset = (
                -(Blockly.BlockSvg.MIN_BLOCK_Y * scale) - (Blockly.BlockSvg.FIELD_Y_OFFSET * scale)
            );
            let renderedPrimary = Blockly.DropDownDiv.showPositionedByBlock(
                this, this.sourceBlock_, this.onHide_.bind(this), secondaryYOffset);
        }

        /**
         * Callback for when a button is clicked inside the drop-down.
         * Should be bound to the FieldIconMenu.
         * @param {Event} e DOM event for the click/touch
         * @private
         */
        private buttonClick_ = function(e: any) {
            let value = e.target.getAttribute('data-value');
            this.setValue(value);
            this.setText(value);
            Blockly.DropDownDiv.hide();
        };

        /**
         * Callback for when the drop-down is hidden.
         */
        private onHide_ = function() {
            Blockly.DropDownDiv.content_.removeAttribute('role');
            Blockly.DropDownDiv.content_.removeAttribute('aria-haspopup');
            Blockly.DropDownDiv.content_.removeAttribute('aria-activedescendant');
        };

        /**
         * Sets the text in this field.  Trigger a rerender of the source block.
         * @param {?string} text New text.
         */
        setText(text: string) {
            if (text === null || text === this.text_) {
                // No change if null.
                return;
            }
            this.text_ = text;
            this.updateTextNode_();

            if (this.imageJson_ && this.textElement_) {
                // Update class for dropdown text.
                // This class is reset every time updateTextNode_ is called.
                this.textElement_.setAttribute('class',
                    this.textElement_.getAttribute('class') + ' blocklyHidden'
                );
                this.imageElement_.parentNode.appendChild(this.arrow_);
            } else if (this.textElement_) {
                // Update class for dropdown text.
                // This class is reset every time updateTextNode_ is called.
                this.textElement_.setAttribute('class',
                    this.textElement_.getAttribute('class') + ' blocklyDropdownText'
                );
                this.textElement_.parentNode.appendChild(this.arrow_);
            }
            if (this.sourceBlock_ && this.sourceBlock_.rendered) {
                this.sourceBlock_.render();
                this.sourceBlock_.bumpNeighbours_();
            }
        };

        /**
         * Updates the width of the field. This calls getCachedWidth which won't cache
         * the approximated width on IE/Edge when `getComputedTextLength` fails. Once
         * it eventually does succeed, the result will be cached.
         **/
        updateWidth() {
            // Calculate width of field
            let width = this.imageJson_.width + 5;

            // Add padding to left and right of text.
            if (this.EDITABLE) {
                width += Blockly.BlockSvg.EDITABLE_FIELD_PADDING;
            }

            this.arrowY_ = this.imageJson_.height / 2;

            // Adjust width for drop-down arrows.
            this.arrowWidth_ = 0;
            if (this.positionArrow) {
                this.arrowWidth_ = this.positionArrow(width);
                width += this.arrowWidth_;
            }

            // Add padding to any drawn box.
            if (this.box_) {
                width += 2 * Blockly.BlockSvg.BOX_FIELD_PADDING;
            }

            // Set width of the field.
            this.size_.width = width;
        };

        /**
         * Update the text node of this field to display the current text.
         * @private
         */
        updateTextNode_() {
            if (!this.textElement_ && !this.imageElement_) {
                // Not rendered yet.
                return;
            }
            let text = this.text_;
            if (text.length > this.maxDisplayLength) {
                // Truncate displayed string and add an ellipsis ('...').
                text = text.substring(0, this.maxDisplayLength - 2) + '\u2026';
                // Add special class for sizing font when truncated
                this.textElement_.setAttribute('class', 'blocklyText blocklyTextTruncated');
            } else {
                this.textElement_.setAttribute('class', 'blocklyText');
            }

            // Empty the text element.
            goog.dom.removeChildren(/** @type {!Element} */ (this.textElement_));
            goog.dom.removeNode(this.imageElement_);
            this.imageElement_ = null;
            if (this.imageJson_) {
                // Image option is selected.
                this.imageElement_ = Blockly.utils.createSvgElement('image',
                    {'y': 5, 'x': 8, 'height': this.imageJson_.height + 'px',
                    'width': this.imageJson_.width + 'px'});
                this.imageElement_.setAttributeNS('http://www.w3.org/1999/xlink',
                                                'xlink:href', this.imageJson_.src);
                this.size_.height = Number(this.imageJson_.height) + 10;

                this.textElement_.parentNode.appendChild(this.imageElement_);
            } else {
                // Replace whitespace with non-breaking spaces so the text doesn't collapse.
                text = text.replace(/\s/g, Blockly.Field.NBSP);
                if (this.sourceBlock_.RTL && text) {
                    // The SVG is LTR, force text to be RTL.
                    text += '\u200F';
                }
                if (!text) {
                    // Prevent the field from disappearing if empty.
                    text = Blockly.Field.NBSP;
                }
                let textNode = document.createTextNode(text);
                this.textElement_.appendChild(textNode);
            }

            // Cached width is obsolete.  Clear it.
            this.size_.width = 0;
        };
    }
}