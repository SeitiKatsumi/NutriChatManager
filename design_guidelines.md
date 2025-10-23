# Nutritionist Dashboard Design Guidelines

## Design Approach: Design System Foundation

**Selected System**: Linear + Material Design hybrid
- **Rationale**: Linear's modern professional dashboard aesthetic combined with Material Design's robust form patterns creates the ideal foundation for a utility-focused nutritionist dashboard with dark theme requirements.

**Core Principles**:
- Information clarity over decoration
- Purposeful spacing for form-heavy interfaces
- Professional restraint with subtle interactive feedback
- Structured hierarchy for complex settings

---

## Typography System

**Font Stack**: Inter (primary), JetBrains Mono (code/data)

**Hierarchy**:
- Page Titles: 2xl (24px), font-semibold, tracking-tight
- Section Headers: xl (20px), font-semibold
- Subsection Labels: base (16px), font-medium
- Form Labels: sm (14px), font-medium
- Body/Input Text: base (16px), font-normal
- Helper Text: sm (14px), font-normal
- Metadata/Captions: xs (12px), font-normal

**Leading**: Use relaxed (1.625) for body text, normal (1.5) for headings

---

## Layout System

**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16, 20

**Page Structure**:
- Main container: max-w-7xl mx-auto px-6 lg:px-8
- Two-column layout for settings: Sidebar navigation (w-64) + Content area (flex-1)
- Content sections: space-y-12 between major sections, space-y-6 within sections

**Grid System**:
- Form fields: Single column on mobile, 2-column grid (grid-cols-1 md:grid-cols-2) for related pairs
- Settings cards: gap-6 between cards
- AI agent customization: 3-column grid for preset options (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)

---

## Component Library

### Navigation
**Sidebar Navigation**:
- Fixed left sidebar with vertical stack of navigation items
- Each item: py-3 px-4, with icon + label (gap-3)
- Active state: Elevated background treatment
- Group sections with divider lines (my-4)

### Cards & Containers
**Settings Sections**:
- Card container: rounded-xl border with p-8
- Inner padding between elements: space-y-6
- Section dividers within cards: my-8, border-t

**Information Cards**:
- Compact variant: p-6 rounded-lg
- Include header with title + optional action button
- Content area with proper spacing

### Forms

**Input Fields**:
- Standard height: h-12
- Padding: px-4
- Rounded: rounded-lg
- Border: border with 2px focus ring
- Label spacing: mb-2 from input
- Helper text: mt-2 below input

**Input Groups**:
- Stack with space-y-4 for related fields
- Two-column pairs with gap-4 for short fields (first name/last name)

**Textarea**:
- Min height: min-h-32
- Padding: p-4
- Resize: resize-none or resize-y

**Select Dropdowns**:
- Match input styling (h-12, px-4, rounded-lg)
- Chevron icon positioned absolutely right-3

**Toggle Switches**:
- Modern switch component (w-12 h-6)
- Label to the left with flex items-center justify-between
- Use for boolean settings

**Radio/Checkbox Groups**:
- Stack with space-y-3
- Each option: flex items-start gap-3
- Radio/checkbox: mt-1 (align with first line of text)

### AI Agent Customization Section

**Preset Cards**:
- Grid layout: 3 columns on desktop, 2 on tablet, 1 on mobile
- Each card: p-6 rounded-lg border
- Selectable with distinct active state
- Content: Icon (h-8 w-8), Title (font-semibold), Description (text-sm)
- Spacing: space-y-3 within card

**Custom Parameters**:
- Slider controls for tone/formality/detail levels
- Range inputs with labeled endpoints
- Display current value above slider

### Buttons

**Primary Actions**: px-6 py-3 rounded-lg font-medium
**Secondary Actions**: px-4 py-2 rounded-md font-medium
**Icon Buttons**: p-2 rounded-md (40x40px touch target)

**Button Grouping**:
- Action bar at bottom of forms: flex justify-end gap-3
- Cancel + Save pattern: Cancel (secondary) left, Save (primary) right

### Data Display

**Profile Summary Card**:
- Avatar (h-20 w-20 rounded-full) + Info layout
- Flex layout with gap-4
- Name (text-xl font-semibold), Role/Title (text-sm), Last login (text-xs)

**Stats Display** (for dashboard):
- Grid of stat cards (grid-cols-1 md:grid-cols-3 gap-6)
- Each card: Label (text-sm), Value (text-3xl font-bold), Change indicator (text-xs)

### Notifications & Alerts

**Inline Alerts**:
- Rounded-lg border-l-4 p-4
- Icon (h-5 w-5) + Message flex layout with gap-3
- Dismissible with close button (absolute top-2 right-2)

---

## Page-Specific Layouts

### Settings Page Structure

**Header Bar**:
- Sticky top-0 with backdrop blur
- Page title + breadcrumb navigation
- Height: h-16 with px-6 horizontal padding

**Content Layout**:
```
[Sidebar Navigation - 256px] | [Content Area - flex-1]
                              |  - Personal Information Section
                              |  - Account Settings Section  
                              |  - AI Agent Configuration Section
                              |  - Privacy & Data Section
                              |  - Notification Preferences Section
```

**Section Pattern**:
- Section header with title (text-xl) + description (text-sm)
- Divider: border-b mb-6
- Form content area
- Action buttons at section bottom

### Personal Information Form

**Layout**:
- Profile photo upload area at top (flex items-center gap-6)
- Two-column grid for: First/Last Name, Email/Phone
- Single column for: Bio (textarea), Address fields
- Specialization tags (multi-select with pills)

### AI Agent Customization

**Structure**:
- Preset selection grid (3 presets: Conversational, Professional, Technical)
- Advanced settings accordion (collapsed by default)
- Parameter sliders section with 4-6 adjustable parameters
- Response preview panel (rounded-lg with sample output)

---

## Accessibility Standards

- All form inputs have associated labels (htmlFor attribute)
- Focus states: 2px ring offset by 2px
- Touch targets: minimum 44x44px
- Keyboard navigation: logical tab order, escape to close modals
- Screen reader: aria-labels for icon-only buttons, role attributes for custom components
- Error states: aria-invalid and error message association

---

## Animations (Minimal)

- Page transitions: None (instant navigation)
- Form interactions: Subtle scale on button press (scale-95 active state)
- Toggle switches: Smooth slide transition (transition-transform duration-200)
- Dropdowns: Slide down with fade (transform + opacity, 150ms)
- No scroll-triggered animations

---

## Images

**No hero image required** - this is a dashboard/settings interface focused on functionality.

**Profile/Avatar Images**:
- User profile photo: Circular, 80x80px on settings page
- Placeholder: Initials on neutral background if no photo
- Upload area: Dashed border box (h-24) with upload icon + "Change Photo" text